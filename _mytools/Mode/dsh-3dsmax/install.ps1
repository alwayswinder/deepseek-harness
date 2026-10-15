<#
    dsh-mode-3dsmax 安装/修复脚本（幂等）

    做四件事：
      1. 把 3dsmax-mcp 服务器 clone 到本包 upstream/3dsmax-mcp（钉定 tag；该目录在 .gitignore 里，不进 git）
      2. uv sync 准备它的解释器环境（首次要联网；之后可 -SkipSync 跳过）
      3. 把本包注册进 profile（junction + dependencies + dsh.profile.bundles）
      4. 校验 preset 的包解析

    代码跟着 _mytools 走 git，但 profile 安装记录与 upstream checkout 都在本机，
    所以每台新机器（或刚 clone 后）跑一次，然后重启 DSH。

    用法：
      powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1
      # 顺带把原生桥插件装进 3ds Max（每台机器/每个 Max 版本一次）：
      powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1 -InstallMaxBridge
      # 只想刷新 profile 注册、不碰服务器：
      ... -SkipUpstream -SkipSync
#>
[CmdletBinding()]
param(
    [string[]]$Profiles = @('desktop', 'web'),

    # ---- 3dsmax-mcp 服务器来源与版本 ----------------------------------------
    # 升级版本就改这一行；改完重跑本脚本即可（会重新 checkout 并 uv sync）。
    # 注意：scripts/mcpcall.py（技能里的零 token 兜底路径）是 v1.7.6 才加入的，
    # 不要钉到 v1.7.5 或更早。
    [string]$UpstreamRepo = 'https://github.com/cl0nazepamm/3dsmax-mcp.git',
    [string]$UpstreamTag = 'v1.7.6',

    # 这台机器的全局 http.proxy 是坏的（指向不存在的代理端口），会让 git 连不上
    # github.com。加这个开关只对本次 clone/fetch 临时清空代理，不改你的全局配置。
    [switch]$BypassProxy,

    # ---- 跳过项 -------------------------------------------------------------
    [switch]$SkipUpstream,      # 不 clone / 不更新服务器
    [switch]$SkipSync,          # 不跑 uv sync（环境已就绪时）
    [switch]$InstallMaxBridge,  # 跑 uv run python install.py，把 .gup 装进 3ds Max
    [switch]$SkipCheck          # 不跑 check-presets.mjs
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$packageRoot = (Resolve-Path $PSScriptRoot).Path
$packageName = '@local/dsh-mode-3dsmax'
$packageId = 'dsh-mode-3dsmax'
$upstreamDir = Join-Path $packageRoot 'upstream\3dsmax-mcp'

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = Join-Path $env:USERPROFILE '.dsh' }
    if ($raw.StartsWith('~')) { $raw = Join-Path $env:USERPROFILE $raw.Substring(1) }
    return (Resolve-Path -LiteralPath $raw -ErrorAction SilentlyContinue)?.Path ?? (
        [System.IO.Path]::GetFullPath($raw))
}

function Get-ManifestVersion([string]$dir) {
    $pyproject = Join-Path $dir 'pyproject.toml'
    if (-not (Test-Path $pyproject)) { return $null }
    $m = Select-String -Path $pyproject -Pattern '^\s*version\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($null -eq $m) { return $null }
    return $m.Matches[0].Groups[1].Value
}

$dshHome = Resolve-DshHome
Write-Host "[mode-3dsmax] DSH_HOME = $dshHome"
Write-Host "[mode-3dsmax] package  = $packageRoot"

if (-not (Test-Path (Join-Path $packageRoot 'cordis.patch.yml'))) {
    throw "cordis.patch.yml 不在 $packageRoot —— 请从仓库里运行本脚本"
}

# ---------------------------------------------------------------- 1. 服务器
if (-not $SkipUpstream) {
    $gitProxyArgs = if ($BypassProxy) { @('-c', 'http.proxy=', '-c', 'https.proxy=') } else { @() }
    Write-Host "[mode-3dsmax] 服务器目标 tag = $UpstreamTag$(if ($BypassProxy) { '（本次 clone 清空 git 代理）' })"
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Warning '找不到 git，跳过服务器准备（装好 git 后重跑本脚本）'
    }
    elseif (-not (Test-Path (Join-Path $upstreamDir '.git'))) {
        New-Item -ItemType Directory -Force -Path (Split-Path $upstreamDir -Parent) | Out-Null
        Write-Host "[mode-3dsmax] clone $UpstreamRepo ($UpstreamTag) ……"
        & git @gitProxyArgs clone --depth 1 --branch $UpstreamTag $UpstreamRepo $upstreamDir
        if ($LASTEXITCODE -ne 0) {
            throw "git clone 失败（exit $LASTEXITCODE）。若报连不上 github.com，检查全局 http.proxy，或用 -BypassProxy 重跑"
        }
    }
    else {
        $head = (& git -C $upstreamDir describe --tags --exact-match 2>$null)
        if ($head -ne $UpstreamTag) {
            Write-Host "[mode-3dsmax] 已有 checkout 是 '$head'，切到 $UpstreamTag ……"
            & git @gitProxyArgs -C $upstreamDir fetch --depth 1 origin "refs/tags/${UpstreamTag}:refs/tags/${UpstreamTag}"
            if ($LASTEXITCODE -eq 0) { & git -C $upstreamDir checkout --force $UpstreamTag }
            if ($LASTEXITCODE -ne 0) { Write-Warning "切到 $UpstreamTag 失败，保留现有 checkout" }
        }
        else {
            Write-Host '[mode-3dsmax] 服务器 checkout 已是目标 tag'
        }
    }

    if (Test-Path $upstreamDir) {
        Write-Host "[mode-3dsmax] 服务器路径 = $upstreamDir"
        Write-Host "[mode-3dsmax] 服务器版本 = $(Get-ManifestVersion $upstreamDir)"
        $fallback = Join-Path $upstreamDir 'scripts\mcpcall.py'
        if (Test-Path $fallback) { Write-Host '[mode-3dsmax] scripts\mcpcall.py 就绪（零 token 兜底路径可用）' }
        else { Write-Warning "这个 tag 里没有 scripts\mcpcall.py；技能里的 mcpcall 兜底路径不可用（v1.7.6 起才有）" }
    }
}

# ---------------------------------------------------------------- 2. uv sync
$uv = Get-Command uv -ErrorAction SilentlyContinue
if ($uv) {
    Write-Host "[mode-3dsmax] uv = $($uv.Source)"
    if (-not $SkipSync -and (Test-Path $upstreamDir)) {
        Write-Host '[mode-3dsmax] uv sync ……'
        Push-Location $upstreamDir
        try {
            & uv sync
            if ($LASTEXITCODE -ne 0) { Write-Warning "uv sync 返回 $LASTEXITCODE" }
        }
        finally { Pop-Location }
    }
    $exe = Join-Path $upstreamDir '.venv\Scripts\3dsmax-mcp.exe'
    if (Test-Path $exe) { Write-Host "[mode-3dsmax] 入口就绪 = $exe" }
    else { Write-Warning "还没看到 $exe（uv sync 未跑或失败）；MCP 首次启动会较慢" }
}
else {
    Write-Warning '找不到 uv；MCP 起不来。装 uv 后重跑本脚本'
}

# ---------------------------------------------------------------- 3. 注册 profile
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
    elseif ($linkItem.LinkType -ne 'Junction' -or $linkItem.Target -ne $packageRoot) {
        Remove-Item -LiteralPath $linkPath -Recurse -Force
        New-Item -ItemType Junction -Path $linkPath -Target $packageRoot | Out-Null
        Write-Host "[$profile] junction 目标已更新 -> $packageRoot"
    }
    else {
        Write-Host "[$profile] junction 已就绪"
    }

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    $changed = $false

    if ($null -eq $manifest.dependencies) {
        $manifest | Add-Member -NotePropertyName 'dependencies' -NotePropertyValue ([pscustomobject]@{}) -Force
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
        Set-Content -LiteralPath $manifestPath -Value $json -Encoding UTF8
        Write-Host "[$profile] package.json 已更新（dependencies + bundles 末尾）"
    }
    else {
        Write-Host "[$profile] package.json 已注册，无需改动"
    }
}

# ---------------------------------------------------------------- 4. Max 桥插件
if ($InstallMaxBridge) {
    if (-not (Test-Path $upstreamDir)) {
        Write-Warning '没有服务器 checkout，无法安装 Max 桥插件'
    }
    elseif (-not $uv) {
        Write-Warning '找不到 uv，无法运行 install.py'
    }
    else {
        Write-Host '[mode-3dsmax] 安装原生桥插件到 3ds Max（install.py）……'
        Push-Location $upstreamDir
        try {
            & uv run python install.py
            if ($LASTEXITCODE -ne 0) { Write-Warning "install.py 返回 $LASTEXITCODE" }
        }
        finally { Pop-Location }
    }
}

# ---------------------------------------------------------------- 5. 校验
if (-not $SkipCheck) {
    $check = Join-Path $repoRoot '_mytools\build\check-presets.mjs'
    if (Test-Path $check) {
        Write-Host '[mode-3dsmax] 校验 preset 包解析 ……'
        & node $check
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "check-presets.mjs 返回 $LASTEXITCODE；请修好 preset 再重启 DSH"
        }
        else {
            Write-Host '[mode-3dsmax] 校验通过（应能看到 3dsmax: ok）'
        }
    }
    else {
        Write-Warning "找不到 $check，跳过校验（需要先 build 出 apps\cli\lib）"
    }
}

Write-Host ''
Write-Host '[mode-3dsmax] 完成。重启 DSH 后，在模式选择器里选「3ds Max」。'
if (-not $InstallMaxBridge) {
    Write-Host '[mode-3dsmax] 提示：若 3ds Max 里没有原生桥，用 -InstallMaxBridge 重跑本脚本。'
}
