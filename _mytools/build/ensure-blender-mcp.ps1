<#
    ensure-blender-mcp.ps1 —— 幂等准备官方 Blender MCP 服务端（Blender Lab 1.0.3）

    DSH 的 profile 把 blender-mcp 注册成全局 MCP（每个会话都带 mcp__blender__*），
    启动命令是 `uv run --directory <DSH_HOME>\tools\blender-mcp blender-mcp`。
    这个目录是本机状态、不进 git，所以换机器 / 重装 DSH_HOME 后跑一次本脚本。

    做三件事：
      1. 目标目录已有可用入口（.venv\Scripts\blender-mcp.exe）时直接退出（-Force 可重装）
      2. 下载官方 .mcpb（zip）到临时目录并解压到目标目录
      3. 在目标目录跑 uv sync

    用法：
      powershell -ExecutionPolicy Bypass -File _mytools\build\ensure-blender-mcp.ps1
      ... -Force        # 已装也重装
      ... -SkipSync     # 只解压，不跑 uv sync

    退出码：0 可用（或已是最新）；1 准备失败（启动脚本据此只告警，不拦启动）。
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$SkipSync
)

$ErrorActionPreference = 'Stop'

# 与服务端版本绑定的下载地址：升级只改这两行。
$BundleUrl = 'https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.3/blender-1.0.3.mcpb'
$BundleVersion = '1.0.3'

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = Join-Path $env:USERPROFILE '.dsh' }
    if ($raw.StartsWith('~')) { $raw = Join-Path $env:USERPROFILE $raw.Substring(1) }
    $resolved = Resolve-Path -LiteralPath $raw -ErrorAction SilentlyContinue
    if ($null -ne $resolved) { return $resolved.Path }
    return [System.IO.Path]::GetFullPath($raw)
}

$dshHome = Resolve-DshHome
$target = Join-Path $dshHome 'tools\blender-mcp'
$entry = Join-Path $target '.venv\Scripts\blender-mcp.exe'

Write-Host "[blender-mcp] DSH_HOME = $dshHome"

if ((Test-Path $entry) -and -not $Force) {
    Write-Host "[blender-mcp] 已就绪：$entry"
    exit 0
}

$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Write-Warning '[blender-mcp] 找不到 uv；先装 uv（https://docs.astral.sh/uv/）再重跑'
    exit 1
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) "blender-mcp-bundle-$BundleVersion"
$bundle = Join-Path ([System.IO.Path]::GetTempPath()) "blender-$BundleVersion.mcpb"

try {
    Write-Host "[blender-mcp] 下载官方 bundle $BundleVersion ……"
    Invoke-WebRequest -Uri $BundleUrl -OutFile $bundle -UseBasicParsing -TimeoutSec 180
}
catch {
    Write-Warning "[blender-mcp] 下载失败（$($_.Exception.Message)）"
    Write-Warning "[blender-mcp] 可手工下载 $BundleUrl 后解压到 $target，再跑 uv sync"
    exit 1
}

try {
    if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Expand-Archive -Path $bundle -DestinationPath $staging -Force
    if (-not (Test-Path (Join-Path $staging 'pyproject.toml'))) {
        throw "bundle 里没有 pyproject.toml，结构可能变了"
    }
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    # 保留已有的 .venv：重复解压不该把环境整个扔掉（-Force 重装时才会重建）
    & robocopy $staging $target /E /COPY:DAT /NFL /NDL /NJH /NJS /XD '.venv' | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy 解压失败（exit $LASTEXITCODE）" }
}
catch {
    Write-Warning "[blender-mcp] 解压失败：$($_.Exception.Message)"
    exit 1
}
finally {
    Remove-Item -LiteralPath $bundle -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $SkipSync) {
    Write-Host '[blender-mcp] uv sync ……'
    Push-Location $target
    try {
        & uv sync
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "[blender-mcp] uv sync 返回 $LASTEXITCODE"
            exit 1
        }
    }
    finally { Pop-Location }
}

if (Test-Path $entry) {
    Write-Host "[blender-mcp] 完成：$entry"
    exit 0
}
Write-Warning "[blender-mcp] 没看到 $entry；检查 $target"
exit 1
