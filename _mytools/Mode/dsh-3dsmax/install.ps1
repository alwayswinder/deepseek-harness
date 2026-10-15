<#
    dsh-mode-3dsmax 安装/修复脚本（幂等）

    代码跟着 _mytools 走 git，但 profile 的安装记录在 $DSH_HOME 下、按机器独立，
    所以每台新机器（或刚 clone 后）跑一次本脚本，然后重启 DSH。

    用法： powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1
    可选： -Profiles desktop,web   -SkipCheck
#>
[CmdletBinding()]
param(
    [string[]]$Profiles = @('desktop', 'web'),
    [switch]$SkipCheck
)

$ErrorActionPreference = 'Stop'

# 仓库根：本脚本在 _mytools\Mode\dsh-3dsmax\ 下，往上三层
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$packageRoot = (Resolve-Path $PSScriptRoot).Path
$packageName = '@local/dsh-mode-3dsmax'
$packageId = 'dsh-mode-3dsmax'

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = Join-Path $env:USERPROFILE '.dsh' }
    if ($raw.StartsWith('~')) { $raw = Join-Path $env:USERPROFILE $raw.Substring(1) }
    return (Resolve-Path -LiteralPath $raw -ErrorAction SilentlyContinue)?.Path ?? (
        [System.IO.Path]::GetFullPath($raw))
}

$dshHome = Resolve-DshHome
Write-Host "[mode-3dsmax] DSH_HOME = $dshHome"
Write-Host "[mode-3dsmax] package  = $packageRoot"

if (-not (Test-Path (Join-Path $packageRoot 'cordis.patch.yml'))) {
    throw "cordis.patch.yml 不在 $packageRoot —— 请从仓库里运行本脚本"
}

foreach ($profile in $Profiles) {
    $profileDir = Join-Path $dshHome "profiles\$profile"
    $manifestPath = Join-Path $profileDir 'package.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Host "[$profile] 跳过：没有 $manifestPath"
        continue
    }

    # 1) node_modules\@local\<id> 指向本包（junction，等价于 pnpm 的 link:）
    $localDir = Join-Path $profileDir 'node_modules\@local'
    New-Item -ItemType Directory -Force -Path $localDir | Out-Null
    $linkPath = Join-Path $localDir $packageId
    $linkItem = Get-Item -LiteralPath $linkPath -ErrorAction SilentlyContinue
    if ($null -eq $linkItem) {
        New-Item -ItemType Junction -Path $linkPath -Target $packageRoot | Out-Null
        Write-Host "[$profile] 已建立 junction: $linkPath"
    }
    elseif ($linkItem.LinkType -ne 'Junction' -or $linkItem.Target -ne $packageRoot) {
        # 目标变了（例如仓库换了位置）：重建
        Remove-Item -LiteralPath $linkPath -Recurse -Force
        New-Item -ItemType Junction -Path $linkPath -Target $packageRoot | Out-Null
        Write-Host "[$profile] junction 目标已更新 -> $packageRoot"
    }
    else {
        Write-Host "[$profile] junction 已就绪"
    }

    # 2) profile 的 package.json：dependencies + dsh.profile.bundles（bundle 放末尾，本地覆盖层最后应用）
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
        # 写之前先确认能解析回来，避免把 profile 写坏
        $null = $json | ConvertFrom-Json
        Set-Content -LiteralPath $manifestPath -Value $json -Encoding UTF8
        Write-Host "[$profile] package.json 已更新（dependencies + bundles 末尾）"
    }
    else {
        Write-Host "[$profile] package.json 已注册，无需改动"
    }
}

if (-not $SkipCheck) {
    $check = Join-Path $repoRoot '_mytools\build\check-presets.mjs'
    if (Test-Path $check) {
        Write-Host "[mode-3dsmax] 校验 preset 包解析 ……"
        & node $check
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "check-presets.mjs 返回 $LASTEXITCODE；请修好 preset 再重启 DSH"
        }
        else {
            Write-Host "[mode-3dsmax] 校验通过（应能看到 3dsmax: ok）"
        }
    }
    else {
        Write-Warning "找不到 $check，跳过校验（需要先 build 出 apps\cli\lib）"
    }
}

Write-Host ''
Write-Host '[mode-3dsmax] 完成。重启 DSH 后，在模式选择器里选「3ds Max」。'
