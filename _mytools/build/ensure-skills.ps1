# Link the personal skills under _mytools\skills into %DSH_HOME%\skills.
#
# The skill loader scans the user root ($DSH_HOME/skills) on every host, so a
# directory junction there makes the repository copy the live skill without a
# second copy to keep in sync. Existing real directories and links that point
# somewhere else are left alone: this script never deletes user data.
#
# ASCII only: Windows PowerShell 5.1 reads a BOM-less file as ANSI.

$ErrorActionPreference = 'Continue'

$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) {
    $dshHome = Join-Path $env:USERPROFILE '.dsh'
}
$dshHome = $dshHome.Trim()
if ($dshHome.StartsWith('~')) {
    $dshHome = Join-Path $env:USERPROFILE $dshHome.Substring(1).TrimStart('\', '/')
}
$dshHome = [System.IO.Path]::GetFullPath($dshHome)

# This script lives in _mytools\build; the repository root is two levels up.
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source = Join-Path $repo '_mytools\skills'
if (-not (Test-Path -LiteralPath $source)) {
    Write-Host '[skills] no _mytools\skills directory; nothing to link'
    exit 0
}

$dest = Join-Path $dshHome 'skills'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$linked = 0
$repaired = 0
$skipped = 0
foreach ($skill in Get-ChildItem -LiteralPath $source -Directory) {
    $target = Join-Path $dest $skill.Name
    # A dangling junction still answers Test-Path, so the link type decides
    # whether the entry is ours to remove or a real directory to leave alone.
    $item = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    if ($null -ne $item) {
        $isLink = $item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink'
        if (-not $isLink) {
            Write-Host "[skills] $($skill.Name): a real directory exists, leaving it"
            $skipped++
            continue
        }
        $current = @($item.Target)[0]
        if ($current -and (Test-Path -LiteralPath $current)) {
            if ($current -eq $skill.FullName) { continue }
            Write-Host "[skills] $($skill.Name): link points to $current, leaving it"
            $skipped++
            continue
        }
        # The target is gone: the repository moved or was deleted. rmdir removes
        # the link itself and never the directory it used to point at.
        Write-Host "[skills] $($skill.Name): link target is gone, relinking"
        cmd /c rmdir "$target" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[skills] WARNING: could not remove the stale link $target"
            continue
        }
        $repaired++
    }
    cmd /c mklink /J "$target" "$($skill.FullName)" | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[skills] linked $($skill.Name)"
        $linked++
    } else {
        Write-Host "[skills] WARNING: could not link $($skill.Name)"
    }
}

Write-Host "[skills] linked=$linked repaired=$repaired skipped=$skipped root=$dest"
exit 0
