<#
    dsh-mode-3dsmax 安装/修复脚本（幂等）

    做五件事：
      1. 把 3dsmax-mcp 服务器 checkout 放到**仓库外**（父目录下的 dsh-3dsmax-mcp，钉定 tag），
         并在本包 upstream/3dsmax-mcp 建 junction 指过去（preset 仍按包内路径解析）
      2. uv sync 准备它的解释器环境（首次要联网；之后可 -SkipSync 跳过）
      3. 把本包注册进 profile（junction + dependencies + dsh.profile.bundles）
      4. 校验 preset 的包解析
      5. 自检：checkout 里的解释器不能是 Low 完整性（否则连不上提权运行的 3ds Max）

    为什么必须放在仓库外：DSH 的 Windows 沙箱给工作区根（默认就是仓库根）打一条
    Low 完整性标签 ACE（带容器/对象继承，见 packages/sandbox/sandbox-windows-acl），
    树里的 exe 会以 Low 启动；而 3ds Max 常以 High（提权）运行，Low 进程写 High 对象的
    命名管道会被 no-write-up 拒掉，MCP 全部报 "Win32 error 5"。浏览器/uv 都在仓库外，
    所以只有 checkout 里的 exe 受影响。把真实 checkout 放仓库外即可根治；
    已经在仓库内建过的旧布局，本脚本会自动复制迁移（复制会重新继承目标目录的 ACE，
    直接 Move 会把 Low 标签一起带走，所以不能用 Move）。

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
# 真实 checkout 在仓库外（工作区根会被沙箱打 Low 完整性标签，见文件头说明）；
# $upstreamDir 是仓库内指向它的 junction，preset 仍按这个包内路径解析。
$checkoutDir = Join-Path (Split-Path $repoRoot -Parent) 'dsh-3dsmax-mcp'
$upstreamDir = Join-Path $packageRoot 'upstream\3dsmax-mcp'

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = Join-Path $env:USERPROFILE '.dsh' }
    if ($raw.StartsWith('~')) { $raw = Join-Path $env:USERPROFILE $raw.Substring(1) }
    # 这里刻意不用 ?. / ?? —— 本脚本要能在 Windows PowerShell 5.1 下跑（README 的调用方式）
    $resolved = Resolve-Path -LiteralPath $raw -ErrorAction SilentlyContinue
    if ($null -ne $resolved) { return $resolved.Path }
    return [System.IO.Path]::GetFullPath($raw)
}

function Get-ManifestVersion([string]$dir) {
    $pyproject = Join-Path $dir 'pyproject.toml'
    if (-not (Test-Path $pyproject)) { return $null }
    $m = Select-String -Path $pyproject -Pattern '^\s*version\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($null -eq $m) { return $null }
    return $m.Matches[0].Groups[1].Value
}

function Move-CheckoutOutOfRepo([string]$From, [string]$To) {
    Write-Host "[mode-3dsmax] 迁移 checkout：$From → $To"
    New-Item -ItemType Directory -Force -Path (Split-Path $To -Parent) | Out-Null
    # 必须复制落地：新文件继承目标目录的 ACE，不会把工作区那条 Low 标签带过来
    # （Move 会把已存在的标签 ACE 一起搬走，等于没修）。
    & robocopy $From $To /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy 迁移失败（exit $LASTEXITCODE）" }
    try {
        Remove-Item -LiteralPath $From -Recurse -Force -ErrorAction Stop
    }
    catch {
        # 沙箱给过写授权的目录带 deny ACE，普通删除会被拒：先拿所有权再重置 ACL
        Write-Host '[mode-3dsmax] 直接删除被拒，先 takeown + icacls /reset ……'
        & takeown /F $From /R /D Y | Out-Null
        & icacls $From /reset /T /C | Out-Null
        try { Remove-Item -LiteralPath $From -Recurse -Force -ErrorAction Stop }
        catch { Write-Warning "旧 checkout 没删掉（$From）：若 MCP 服务正在用它，先退出 DSH 再重跑本脚本" }
    }
    Write-Host '[mode-3dsmax] 迁移完成'
}

function Ensure-CheckoutLayout {
    $item = Get-Item -LiteralPath $upstreamDir -Force -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -ne 'Junction') {
        if (Test-Path $checkoutDir) {
            throw "仓库内 $upstreamDir（真目录）与仓库外 $checkoutDir 同时存在，先人工确认保留哪一个"
        }
        Move-CheckoutOutOfRepo -From $upstreamDir -To $checkoutDir
        $item = $null
    }
    if (-not (Test-Path $checkoutDir)) { return }
    if ($null -eq $item) {
        New-Item -ItemType Directory -Force -Path (Split-Path $upstreamDir -Parent) | Out-Null
        New-Item -ItemType Junction -Path $upstreamDir -Target $checkoutDir | Out-Null
        Write-Host "[mode-3dsmax] 已建立 junction: $upstreamDir -> $checkoutDir"
    }
    elseif (($item.Target | Select-Object -First 1) -ne $checkoutDir) {
        Remove-Item -LiteralPath $upstreamDir -Force
        New-Item -ItemType Junction -Path $upstreamDir -Target $checkoutDir | Out-Null
        Write-Host "[mode-3dsmax] junction 目标已更新 -> $checkoutDir"
    }
}

$dshHome = Resolve-DshHome
Write-Host "[mode-3dsmax] DSH_HOME = $dshHome"
Write-Host "[mode-3dsmax] package  = $packageRoot"

if (-not (Test-Path (Join-Path $packageRoot 'cordis.patch.yml'))) {
    throw "cordis.patch.yml 不在 $packageRoot —— 请从仓库里运行本脚本"
}

# ------------------------------------- 0. 布局：旧布局迁移 + 包内 junction（幂等）
# 必须在 clone 之前跑：否则会误以为“仓库外没有 checkout”而重新 clone 一份。
Ensure-CheckoutLayout

# ---------------------------------------------------------------- 1. 服务器
if (-not $SkipUpstream) {
    $gitProxyArgs = if ($BypassProxy) { @('-c', 'http.proxy=', '-c', 'https.proxy=') } else { @() }
    Write-Host "[mode-3dsmax] 服务器目标 tag = $UpstreamTag$(if ($BypassProxy) { '（本次 clone 清空 git 代理）' })"
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Warning '找不到 git，跳过服务器准备（装好 git 后重跑本脚本）'
    }
    elseif (-not (Test-Path (Join-Path $checkoutDir '.git'))) {
        New-Item -ItemType Directory -Force -Path (Split-Path $checkoutDir -Parent) | Out-Null
        Write-Host "[mode-3dsmax] clone $UpstreamRepo ($UpstreamTag) → $checkoutDir ……"
        & git @gitProxyArgs clone --depth 1 --branch $UpstreamTag $UpstreamRepo $checkoutDir
        if ($LASTEXITCODE -ne 0) {
            throw "git clone 失败（exit $LASTEXITCODE）。若报连不上 github.com，检查全局 http.proxy，或用 -BypassProxy 重跑"
        }
    }
    else {
        $head = (& git -C $checkoutDir describe --tags --exact-match 2>$null)
        if ($head -ne $UpstreamTag) {
            Write-Host "[mode-3dsmax] 已有 checkout 是 '$head'，切到 $UpstreamTag ……"
            & git @gitProxyArgs -C $checkoutDir fetch --depth 1 origin "refs/tags/${UpstreamTag}:refs/tags/${UpstreamTag}"
            if ($LASTEXITCODE -eq 0) { & git -C $checkoutDir checkout --force $UpstreamTag }
            if ($LASTEXITCODE -ne 0) { Write-Warning "切到 $UpstreamTag 失败，保留现有 checkout" }
        }
        else {
            Write-Host '[mode-3dsmax] 服务器 checkout 已是目标 tag'
        }
    }

    if (Test-Path $checkoutDir) {
        Write-Host "[mode-3dsmax] 服务器路径 = $checkoutDir"
        Write-Host "[mode-3dsmax] 服务器版本 = $(Get-ManifestVersion $checkoutDir)"
        $fallback = Join-Path $checkoutDir 'scripts\mcpcall.py'
        if (Test-Path $fallback) { Write-Host '[mode-3dsmax] scripts\mcpcall.py 就绪（零 token 兜底路径可用）' }
        else { Write-Warning "这个 tag 里没有 scripts\mcpcall.py；技能里的 mcpcall 兜底路径不可用（v1.7.6 起才有）" }
    }
}

# ------------------------------------- 1b. 仓库外 checkout + 包内 junction（幂等）
# 旧布局（仓库内真目录）在这里自动迁移出去，preset 走 junction 不受影响。
Ensure-CheckoutLayout

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

    # 完整性自检：解释器进程的完整性等级必须不低于 3ds Max 的，否则写它的命名管道
    # 会被 no-write-up 拒掉（MCP 报 Win32 error 5）。checkout 落在工作区里就会这样。
    $py = Join-Path $upstreamDir '.venv\Scripts\python.exe'
    if (Test-Path $py) {
        # python 代码里只用单引号：Windows PowerShell 5.1 传原生参数会把内层双引号吃掉
        $probe = "import subprocess;print(subprocess.run(['whoami','/groups'],capture_output=True,text=True).stdout)"
        $label = (& $py -c $probe | Out-String)
        if ($label -match 'Low Mandatory Level') {
            Write-Warning "checkout 解释器是 Low 完整性：MCP 一定连不上 3ds Max（Win32 error 5）。确认 $checkoutDir 位于工作区之外，且没有被继承 Low 标签"
        }
        elseif ($label -match 'Medium Mandatory Level') {
            Write-Warning "checkout 解释器是 Medium 完整性：只在 3ds Max 未提权（同为 Medium）时能连上"
        }
        elseif ($label -match 'High Mandatory Level') {
            Write-Host '[mode-3dsmax] 完整性自检 = High（可连提权运行的 3ds Max）'
        }
        else {
            Write-Warning '完整性自检没读到 Mandatory Label，跳过'
        }
    }
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
