# Reconcile one profile's plugin set with profile-plugins.json.
#
# The install record of a profile lives under %DSH_HOME%\profiles\<name>\package.json
# and never travels with the repository, so a second machine starts with none of the
# plugins this checkout uses. This script reads the shared baseline beside it and
# fills in what that machine is missing: local packages whose link: or file: path
# must be recomputed for this checkout, npm packages that are absent entirely, and
# the dsh.profile.bundles rows the loader mounts at boot.
#
# Idempotent and quiet: a profile that already matches exits without touching the
# network or the file, and an uninitialized profile is skipped so the first launch
# of a fresh machine still lets DSH create it. A package that is already present
# with an npm spec keeps the version this machine installed; only a local path is
# rewritten, because a moved checkout is the one case the baseline can still judge.
#
# Success is judged by the manifest after pnpm returns, not by its exit code: pnpm
# rewrites the manifest first and reports through a pipe the launcher may not own.
#
# ASCII only: Windows PowerShell 5.1 reads a BOM-less file as ANSI.

param(
    [Parameter(Mandatory = $true)]
    [Alias('Profile')]
    [string]$ProfileName,
    [int]$InstallTimeoutSeconds = 300,
    # Report what this profile is missing without installing it or writing the manifest.
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$baselinePath = Join-Path $PSScriptRoot 'profile-plugins.json'
if (-not (Test-Path -LiteralPath $baselinePath)) {
    Write-Host "[plugins] no profile-plugins.json beside this script; skipping the $ProfileName baseline"
    exit 0
}

$baseline = Get-Content -LiteralPath $baselinePath -Raw | ConvertFrom-Json
$declaredEntry = $baseline.profiles.PSObject.Properties[$ProfileName]
if ($null -eq $declaredEntry) {
    Write-Host "[plugins] profile-plugins.json has no baseline for $ProfileName; skipping"
    exit 0
}
$declared = $declaredEntry.Value

$dshHome = Resolve-DshHome
$profileDir = Join-Path $dshHome (Join-Path 'profiles' $ProfileName)
$manifestPath = Join-Path $profileDir 'package.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Host "[plugins] the $ProfileName profile is not initialized yet; the next launch reconciles it"
    exit 0
}

# A local spec is stored relative to the repository root so the same baseline works
# from any checkout; pnpm and DSH both read the absolute form.
function Resolve-DeclaredSpec {
    param([string]$Spec)

    foreach ($prefix in @('link:', 'file:')) {
        if ($Spec.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            $relative = $Spec.Substring($prefix.Length)
            $absolute = [System.IO.Path]::GetFullPath((Join-Path $repo $relative))
            return $prefix + ($absolute -replace '\\', '/')
        }
    }
    return $Spec
}

function Read-Manifest {
    return (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
}

# Specs this profile is missing or must re-point, in the form pnpm add accepts.
function Get-MissingSpecs {
    param($Manifest)

    $installed = @{}
    if ($null -ne $Manifest.dependencies) {
        foreach ($property in $Manifest.dependencies.PSObject.Properties) {
            $installed[$property.Name] = [string]$property.Value
        }
    }

    $result = @()
    foreach ($property in $declared.packages.PSObject.Properties) {
        $name = $property.Name
        $want = Resolve-DeclaredSpec ([string]$property.Value)
        $have = $installed[$name]
        if ($null -eq $have) {
            $result += "$name@$want"
            continue
        }
        $isLocal = $want.StartsWith('link:') -or $want.StartsWith('file:')
        if ($isLocal) {
            $haveIsLocal = $have.StartsWith('link:') -or $have.StartsWith('file:')
            if (-not $haveIsLocal) {
                $result += "$name@$want"
                continue
            }
            # link: and file: name the same source directory; only a different
            # directory means the checkout moved. The launcher's own registrations
            # record file: where this baseline records link:, and rewriting that
            # each start would make two scripts fight over one line.
            $wantPath = $want.Substring($want.IndexOf(':') + 1)
            $havePath = $have.Substring($have.IndexOf(':') + 1)
            if (-not [string]::Equals($havePath, $wantPath, [StringComparison]::OrdinalIgnoreCase)) {
                $result += "$name@$want"
            }
        }
    }
    return $result
}

$manifest = Read-Manifest
$missing = @(Get-MissingSpecs $manifest)

if ($missing.Count -gt 0 -and $PlanOnly) {
    Write-Host "[plugins] $ProfileName profile: would install $($missing.Count) plugin(s):"
    foreach ($spec in $missing) { Write-Host "[plugins]   $spec" }
    exit 0
}

$installedCount = 0
if ($missing.Count -gt 0) {
    $pnpmPath = $null
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($null -ne $pnpmCommand) { $pnpmPath = $pnpmCommand.Source }
    if ($null -eq $pnpmPath) {
        $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
        if ($null -ne $pnpmCommand) { $pnpmPath = $pnpmCommand.Source }
    }
    if ($null -eq $pnpmPath) {
        Write-Host "[plugins] WARNING: pnpm was not found; the $ProfileName profile stays without $($missing.Count) plugin(s)"
        exit 1
    }

    Write-Host "[plugins] $ProfileName profile: installing $($missing.Count) plugin(s) from the repository baseline"
    $arguments = @('add', '--dir', $profileDir) + $missing
    $process = Start-Process -FilePath $pnpmPath -ArgumentList $arguments -PassThru -NoNewWindow
    if (-not $process.WaitForExit($InstallTimeoutSeconds * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[plugins] WARNING: pnpm add did not finish within $InstallTimeoutSeconds s; press the launcher again when the network settles"
        exit 1
    }

    # The manifest is the outcome: pnpm can finish a partial install and still exit 0
    # when one registry timed out, so ask the file instead of the process.
    $manifest = Read-Manifest
    $stillMissing = @(Get-MissingSpecs $manifest)
    if ($stillMissing.Count -gt 0) {
        Write-Host "[plugins] WARNING: $($stillMissing.Count) plugin(s) could not be installed: $($stillMissing -join ', ')"
        exit 1
    }
    $installedCount = $missing.Count
}

$bundleRows = @()
$hasProfileSection = $null -ne $manifest.dsh -and $null -ne $manifest.dsh.profile
if ($hasProfileSection -and $null -ne $manifest.dsh.profile.bundles) {
    $bundleRows = @($manifest.dsh.profile.bundles)
}

$addedBundles = @()
foreach ($bundle in @($declared.bundles)) {
    if ($bundleRows -notcontains $bundle) {
        $bundleRows += $bundle
        $addedBundles += $bundle
    }
}

if ($addedBundles.Count -gt 0) {
    if (-not $hasProfileSection) {
        Write-Host "[plugins] WARNING: $manifestPath has no dsh.profile section; cannot add bundle row(s) $($addedBundles -join ', ')"
        exit 1
    }
    if ($PlanOnly) {
        Write-Host "[plugins] $ProfileName profile: would add bundle row(s): $($addedBundles -join ', ')"
        exit 0
    }
    $manifest.dsh.profile.bundles = $bundleRows
    $json = $manifest | ConvertTo-Json -Depth 20
    # No BOM: JSON.parse rejects one, and the harness reads this file that way.
    [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[plugins] $ProfileName profile: added bundle row(s): $($addedBundles -join ', ')"
}

if ($installedCount -eq 0 -and $addedBundles.Count -eq 0) {
    Write-Host "[plugins] $ProfileName profile: baseline already satisfied"
}

exit 0
