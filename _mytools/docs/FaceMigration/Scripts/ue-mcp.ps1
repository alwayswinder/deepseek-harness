<#
.SYNOPSIS
    以 UE 5.8 内置 MCP 服务（ModelContextProtocol 插件）为目标的极简 MCP 客户端。

.DESCRIPTION
    （本文件是 UE 项目仓库里的副本；canonical 版本在
    DSH 仓库的 _mytools\Mode\dsh-unreal\tools\ue-mcp.ps1，改完以那份为准。）
    编辑器把 MCP 服务挂在 http://127.0.0.1:8000/mcp（项目设置里可改端口/路径）上，
    默认只暴露三个元工具：

        list_toolsets    列出全部 toolset
        describe_toolset 给出某个 toolset 的工具名 + inputSchema
        call_tool        调用 toolset 内的工具（tool_name 传**短名**，如 "GetLogEntries"）

    这是本模式的零 token 兜底路径：不走 MCP 客户端注册，因此不进任何请求的
    system prompt / tool schema —— 适合"只在需要时跑一条命令"的场景。

    会话 id 缓存在 %TEMP%\ue-mcp.session，编辑器重启后自动重新 initialize。

.PARAMETER Endpoint
    MCP 端点，默认取 env:DSH_UNREAL_MCP_URL，否则 http://127.0.0.1:8000/mcp。

.EXAMPLE
    .\tools\ue-mcp.ps1 -Toolsets

.EXAMPLE
    .\tools\ue-mcp.ps1 -Describe EditorToolset.LogsToolset

.EXAMPLE
    .\tools\ue-mcp.ps1 -Toolset EditorToolset.LogsToolset -Tool GetLogEntries `
        -Arguments '{"category":"","pattern":"Error","maxEntries":20}'

.EXAMPLE
    .\tools\ue-mcp.ps1 -TopLevelTool list_toolsets -Raw
#>
[CmdletBinding(DefaultParameterSetName = 'None')]
param(
    [string]$Endpoint = $(if ($env:DSH_UNREAL_MCP_URL) { $env:DSH_UNREAL_MCP_URL } else { 'http://127.0.0.1:8000/mcp' }),

    [Parameter(ParameterSetName = 'Toolsets')]
    [switch]$Toolsets,

    [Parameter(ParameterSetName = 'Describe')]
    [string]$Describe,

    [Parameter(ParameterSetName = 'Call')]
    [string]$Toolset,

    [Parameter(ParameterSetName = 'Call')]
    [string]$Tool,

    [Parameter(ParameterSetName = 'Call')]
    [string]$Arguments = '{}',

    [Parameter(ParameterSetName = 'Call')]
    [string]$TopLevelTool,

    [switch]$Raw,

    [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'Stop'
$StateFile = Join-Path $env:TEMP 'ue-mcp.session'
$script:SessionId = $null
$script:NextId = 1

function New-Session {
    $body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dsh-mode-unreal","version":"1.0"}}}'
    $r = Invoke-WebRequest -Uri $Endpoint -Method Post -Body $body -ContentType 'application/json' `
        -Headers @{ 'Accept' = 'application/json, text/event-stream' } -TimeoutSec $TimeoutSec -UseBasicParsing
    $sid = $r.Headers['Mcp-Session-Id']
    if ($sid -is [array]) { $sid = $sid[0] }
    if (-not $sid) { throw 'MCP server did not return an Mcp-Session-Id header.' }
    $script:SessionId = $sid
    Set-Content -Path $StateFile -Value $sid -NoNewline
    $h = @{ 'Accept' = 'application/json, text/event-stream'; 'Mcp-Session-Id' = $sid }
    Invoke-WebRequest -Uri $Endpoint -Method Post -ContentType 'application/json' -Headers $h `
        -Body '{"jsonrpc":"2.0","method":"notifications/initialized"}' -TimeoutSec $TimeoutSec -UseBasicParsing | Out-Null
}

function Ensure-Session {
    if ($script:SessionId) { return }
    if (Test-Path $StateFile) {
        $cached = (Get-Content $StateFile -Raw).Trim()
        if ($cached) { $script:SessionId = $cached; return }
    }
    New-Session
}

function Invoke-Rpc {
    param([string]$Method, [hashtable]$Params)
    Ensure-Session
    $id = $script:NextId++
    $payload = @{ jsonrpc = '2.0'; id = $id; method = $Method }
    if ($Params) { $payload.params = $Params }
    $json = $payload | ConvertTo-Json -Depth 20 -Compress
    $headers = @{ 'Accept' = 'application/json, text/event-stream'; 'Mcp-Session-Id' = $script:SessionId }
    try {
        $r = Invoke-WebRequest -Uri $Endpoint -Method Post -Body $json -ContentType 'application/json' `
            -Headers $headers -TimeoutSec $TimeoutSec -UseBasicParsing
    }
    catch {
        # 会话过期（编辑器重启）→ 重新 initialize 一次再重试。
        Remove-Item $StateFile -ErrorAction SilentlyContinue
        $script:SessionId = $null
        New-Session
        $headers['Mcp-Session-Id'] = $script:SessionId
        $r = Invoke-WebRequest -Uri $Endpoint -Method Post -Body $json -ContentType 'application/json' `
            -Headers $headers -TimeoutSec $TimeoutSec -UseBasicParsing
    }
    $parsed = $r.Content | ConvertFrom-Json
    if ($parsed.error) { throw ('MCP error {0}: {1}' -f $parsed.error.code, $parsed.error.message) }
    return $parsed.result
}

function Invoke-McpTool {
    param([string]$Name, $Arguments = @{})
    $res = Invoke-Rpc -Method 'tools/call' -Params @{ name = $Name; arguments = $Arguments }
    $text = ($res.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n"
    if ($res.isError) { throw "Tool '$Name' failed: $text" }
    return $text
}

function ConvertFrom-JsonText {
    param([string]$Text)
    if ($Raw) { return $Text }
    try { return ($Text | ConvertFrom-Json) } catch { return $Text }
}

switch ($PSCmdlet.ParameterSetName) {
    'Toolsets' { ConvertFrom-JsonText (Invoke-McpTool -Name 'list_toolsets' -Arguments @{}) }
    'Describe' { ConvertFrom-JsonText (Invoke-McpTool -Name 'describe_toolset' -Arguments @{ toolset_name = $Describe }) }
    'Call' {
        if ($TopLevelTool) {
            $argsObj = $Arguments | ConvertFrom-Json -AsHashtable
            ConvertFrom-JsonText (Invoke-McpTool -Name $TopLevelTool -Arguments $argsObj)
        }
        else {
            if (-not $Toolset) { throw '需要 -Toolset（或 -TopLevelTool 直接调元工具）' }
            $inner = @{ toolset_name = $Toolset; arguments = ($Arguments | ConvertFrom-Json -AsHashtable) }
            if ($Tool) { $inner.tool_name = $Tool }
            ConvertFrom-JsonText (Invoke-McpTool -Name 'call_tool' -Arguments $inner)
        }
    }
    default { Get-Help $PSCommandPath }
}
