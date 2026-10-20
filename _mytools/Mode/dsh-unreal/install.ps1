<#
    dsh-mode-unreal 安装/修复脚本（幂等）

    只做三件事，比 dsh-3dsmax 那个简单得多：本模式不 clone 上游、不建解释器环境、
    不起子进程（UE 5.8 的 MCP 是编辑器内自带的 HTTP 服务），所以没有 checkout、
    没有 uv sync、也没有 Windows 沙箱完整性标签那个坑。

      1. 把本包注册进 profile（node_modules/@local junction + dependencies + dsh.profile.bundles）
      2. 探测 UE MCP 端点（默认 http://127.0.0.1:8000/mcp），报告编辑器在不在、暴露几个工具
      3. 校验 preset 包解析，并检查 preset 是否与上游 standard 漂移

    用法：
      powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-unreal\install.ps1
      # 只想刷新 profile 注册、不做校验：
      ... -SkipCheck
      # 编辑器换了端口（项目设置 → Model Context Protocol → ServerPortNumber）：
      ... -Endpoint http://127.0.0.1:9000/mcp
#>
[CmdletBinding()]
param(
    [string[]]$Profiles = @('desktop', 'web'),

    # 与 preset 里的 DSH_UNREAL_MCP_URL 是同一个契约：报给本脚本的地址应当与你实际
    # 让 DSH 连的地址一致，否则这里通过、模式里连不上。
    [string]$Endpoint = $(if ($env:DSH_UNREAL_MCP_URL) { $env:DSH_UNREAL_MCP_URL } else { 'http://127.0.0.1:8000/mcp' }),

    [switch]$SkipCheck
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$packageRoot = (Resolve-Path $PSScriptRoot).Path
$packageName = '@local/dsh-mode-unreal'
$packageId = 'dsh-mode-unreal'

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = Join-Path $env:USERPROFILE '.dsh' }
    if ($raw.StartsWith('~')) { $raw = Join-Path $env:USERPROFILE $raw.Substring(1) }
    # 这里刻意不用 ?. / ?? —— 本脚本要能在 Windows PowerShell 5.1 下跑
    $resolved = Resolve-Path -LiteralPath $raw -ErrorAction SilentlyContinue
    if ($null -ne $resolved) { return $resolved.Path }
    return [System.IO.Path]::GetFullPath($raw)
}

$dshHome = Resolve-DshHome
Write-Host "[mode-unreal] DSH_HOME = $dshHome"
Write-Host "[mode-unreal] package  = $packageRoot"

if (-not (Test-Path (Join-Path $packageRoot 'cordis.patch.yml'))) {
    throw "cordis.patch.yml 不在 $packageRoot —— 先跑 node _mytools\Mode\dsh-unreal\sync-preset.mjs"
}

# ---------------------------------------------------------------- 1. 注册 profile
foreach ($profile in $Profiles) {
    $profileDir = Join-Path $dshHome "profiles\$profile"
    $manifestPath = Join-Path $profileDir 'package.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Host "[$profile] 跳过：没有 $manifestPath"
        continue
    }

    $localDir = Join-Path $profileDir 'node_modules\@local'
    New-Item -ItemType Directory -Force -Path $localDir | Out-Null
    $linkPath = Join-Path $localDir $packageId
    $linkItem = Get-Item -LiteralPath $linkPath -ErrorAction SilentlyContinue
    if ($null -eq $linkItem) {
        New-Item -ItemType Junction -Path $linkPath -Target $packageRoot | Out-Null
        Write-Host "[$profile] 已建立 junction: $linkPath"
    }
    elseif ($linkItem.LinkType -ne 'Junction' -or ($linkItem.Target | Select-Object -First 1) -ne $packageRoot) {
        Remove-Item -LiteralPath $linkPath -Recurse -Force
        New-Item -ItemType Junction -Path $linkPath -Target $packageRoot | Out-Null
        Write-Host "[$profile] junction 目标已更新 -> $packageRoot"
    }
    else {
        Write-Host "[$profile] junction 已就绪"
    }

    # Get-Content 解码时会吃掉 BOM，所以按字节判断；Harness 用 JSON.parse 读这份清单，
    # 带 BOM 会让 Desktop 直接起不来，发现就标记重写（写成无 BOM）
    $bytes = [System.IO.File]::ReadAllBytes($manifestPath)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    $raw = Get-Content -Raw -LiteralPath $manifestPath
    $changed = $false
    if ($hasBom) {
        if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
        $changed = $true
    }
    $manifest = $raw | ConvertFrom-Json

    if ($null -eq $manifest.dependencies) {
        $manifest | Add-Member -NotePropertyName 'dependencies' -NotePropertyValue ([pscustomobject]@{}) -Force
        $changed = $true
    }
    if (-not (@($manifest.dependencies.PSObject.Properties.Name) -contains $packageName)) {
        $manifest.dependencies | Add-Member -NotePropertyName $packageName `
            -NotePropertyValue ("link:" + ($packageRoot -replace '\\', '/')) -Force
        $changed = $true
    }

    if ($null -eq $manifest.dsh) {
        $manifest | Add-Member -NotePropertyName 'dsh' -NotePropertyValue ([pscustomobject]@{}) -Force
        $changed = $true
    }
    if ($null -eq $manifest.dsh.profile) {
        $manifest.dsh | Add-Member -NotePropertyName 'profile' -NotePropertyValue ([pscustomobject]@{}) -Force
        $changed = $true
    }
    $bundles = @($manifest.dsh.profile.bundles)
    if ($bundles -notcontains $packageName) {
        $bundles = @($bundles + $packageName)
        $manifest.dsh.profile | Add-Member -NotePropertyName 'bundles' -NotePropertyValue $bundles -Force
        $changed = $true
    }

    if ($changed) {
        $json = $manifest | ConvertTo-Json -Depth 12
        $null = $json | ConvertFrom-Json          # 写之前确认能解析回来
        # 不能用 Set-Content -Encoding UTF8：Windows PowerShell 5.1 会加 BOM
        [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "[$profile] package.json 已更新（dependencies + bundles 末尾）"
    }
    else {
        Write-Host "[$profile] package.json 已注册，无需改动"
    }
}

# ---------------------------------------------------------------- 2. 探测 UE MCP 端点
Write-Host "[mode-unreal] 探测 $Endpoint ……"
$probeOk = $false
try {
    $hdr = @{ 'Accept' = 'application/json, text/event-stream' }
    $init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dsh-mode-unreal-install","version":"1.0"}}}'
    $r = Invoke-WebRequest -Uri $Endpoint -Method Post -Body $init -ContentType 'application/json' -Headers $hdr -TimeoutSec 10 -UseBasicParsing
    $sid = ($r.Headers['Mcp-Session-Id'] | Select-Object -First 1)
    $h2 = @{ 'Accept' = 'application/json, text/event-stream'; 'Mcp-Session-Id' = $sid }
    Invoke-WebRequest -Uri $Endpoint -Method Post -Body '{"jsonrpc":"2.0","method":"notifications/initialized"}' `
        -ContentType 'application/json' -Headers $h2 -TimeoutSec 10 -UseBasicParsing | Out-Null
    $tl = Invoke-WebRequest -Uri $Endpoint -Method Post -Body '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' `
        -ContentType 'application/json' -Headers $h2 -TimeoutSec 10 -UseBasicParsing
    $tools = ($tl.Content | ConvertFrom-Json).result.tools
    $names = ($tools | ForEach-Object { $_.name }) -join ', '
    $bytes = [Text.Encoding]::UTF8.GetByteCount(($tools | ConvertTo-Json -Depth 20 -Compress))
    Write-Host "[mode-unreal] 端点可用：$($tools.Count) 个工具（schema $bytes 字节）→ $names"
    if ($tools.Count -le 3) {
        Write-Host '[mode-unreal] 这是渐进模式（bEnableToolSearch=True，只暴露 3 个元工具）——本模式的设计前提'
    }
    else {
        Write-Warning "编辑器把 $($tools.Count) 个工具全部原生暴露（bEnableToolSearch=False）：每个请求都要付几万 token，本模式的省 token 前提没了"
    }
    $probeOk = $true
}
catch {
    Write-Warning "端点探测失败（$($_.Exception.Message)）"
    Write-Warning '  编辑器没开、端口不是 8000、或 ServerPortNumber 改过。模式本身仍能挂载（failOnStartupError: false），'
    Write-Warning '  但没有工具可用；把编辑器起来后重启 DSH，或用 DSH_UNREAL_MCP_URL 指向正确的地址。'
}

# ---------------------------------------------------------------- 3. 校验
if (-not $SkipCheck) {
    # MCP 行的 config 键是否仍被当前 mcp-client 接受 —— check-presets 验不出这一半，
    # 而键改名会让整个 preset 挂载失败、模式从选择器里静默消失。
    $cfgCheck = Join-Path $packageRoot 'tools\check-config.mjs'
    if (Test-Path $cfgCheck) {
        Write-Host '[mode-unreal] 校验 MCP 行是否被 mcp-client 接受 ……'
        & node $cfgCheck
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'MCP 行不被当前 mcp-client 接受；改 sync-preset.mjs 的 mcpConfig 后重新生成'
        }
    }

    $check = Join-Path $repoRoot '_mytools\build\check-presets.mjs'
    if (Test-Path $check) {
        Write-Host '[mode-unreal] 校验 preset 包解析 ……'
        & node $check
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "check-presets.mjs 返回 $LASTEXITCODE；请修好 preset 再重启 DSH"
        }
        else {
            Write-Host '[mode-unreal] 校验通过（应能看到 unreal: ok）'
        }
    }
    else {
        Write-Warning "找不到 $check，跳过校验（需要先 build 出 apps\cli\lib）"
    }

    # 上游改过 standard 后本 preset 会漂移：包名照样能解析，但某个 config 键可能已经
    # 不再受支持，整个 preset 挂载失败并从模式选择器里消失。这里只报告，不自动改写。
    $sync = Join-Path $packageRoot 'sync-preset.mjs'
    if (Test-Path $sync) {
        Write-Host '[mode-unreal] 校验 preset 是否与上游 standard 同步 ……'
        & node $sync --check
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'preset 与上游 standard 漂移；跑 node _mytools\Mode\dsh-unreal\sync-preset.mjs 重新生成后重启 DSH'
        }
    }
}

Write-Host ''
if ($probeOk) {
    Write-Host '[mode-unreal] 完成。重启 DSH 后，在模式选择器里选「Unreal Engine」。'
}
else {
    Write-Host '[mode-unreal] 注册完成，但 UE 端点当前不可用。先启动编辑器，再重启 DSH 并选「Unreal Engine」。'
}
