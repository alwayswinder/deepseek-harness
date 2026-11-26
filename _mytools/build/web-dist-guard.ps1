<#
.SYNOPSIS
  Keep the served Web UI alive across a rebuild of apps\web\dist.

.DESCRIPTION
  `pnpm run clean` and `vite build` both empty apps\web\dist before they write it.
  A build that fails after that leaves a running DSH with no page to load, so the
  browser shows a blank window until a successful build writes the document back.
  This script keeps the last good copy under the harness home and puts it back
  when a build does not finish.

  The copy lives outside the repository: it survives `clean`, it is never part of
  a commit, and every machine keeps its own.

.PARAMETER Action
  backup  - copy the current apps\web\dist when it holds a page; exit code 2
            means there was nothing to preserve and the build may start fresh.
  restore - replace apps\web\dist with the saved copy after a failed build.
  clear   - remove the saved copy after a successful build.

.PARAMETER Repo
  Repository root, the directory that holds package.json.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('backup', 'restore', 'clear')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Repo
)

$ErrorActionPreference = 'Stop'

function Resolve-DshHome {
    $value = $env:DSH_HOME
    if ([string]::IsNullOrWhiteSpace($value)) {
        return [IO.Path]::GetFullPath((Join-Path $HOME '.dsh'))
    }
    $value = $value.Trim()
    if ($value.StartsWith('~')) {
        $value = Join-Path $HOME $value.TrimStart('~').TrimStart('\', '/')
    }
    return [IO.Path]::GetFullPath($value)
}

$dist = Join-Path $Repo 'apps\web\dist'
$backup = Join-Path (Resolve-DshHome) 'build\web-dist-backup'
# The marker sits beside the backup, not inside it, so a restore cannot copy it
# into dist. It exists only once the copy finished.
$marker = "$backup.done"

function Copy-Tree([string]$From, [string]$To) {
    # robocopy answers 0-7 for success (bits mean "files copied", not "error") and
    # 8+ when something was not copied.
    & robocopy $From $To /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
}

try {
    switch ($Action) {
        'backup' {
            if (-not (Test-Path (Join-Path $dist 'index.html'))) {
                Write-Host '[dist-guard] apps\web\dist holds no index.html; nothing to preserve.'
                exit 2
            }
            if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
            if (Test-Path $marker) { Remove-Item $marker -Force }
            New-Item -ItemType Directory -Force -Path $backup | Out-Null
            Copy-Tree $dist $backup
            Set-Content -Path $marker -Value (Get-Date -Format 'o') -Encoding ASCII
            Write-Host "[dist-guard] saved apps\web\dist to $backup"
        }
        'restore' {
            if (-not (Test-Path $marker)) {
                Write-Host '[dist-guard] no saved Web UI to restore.'
                exit 0
            }
            if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
            New-Item -ItemType Directory -Force -Path $dist | Out-Null
            Copy-Tree $backup $dist
            # Keep the backup and its marker: a later reader can still recover it,
            # and the next backup replaces both.
            Write-Host "[dist-guard] build did not finish; restored the previous Web UI from $backup"
        }
        'clear' {
            if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
            if (Test-Path $marker) { Remove-Item $marker -Force }
            Write-Host '[dist-guard] build finished; removed the saved Web UI copy.'
        }
    }
} catch {
    Write-Host "[dist-guard] $($_.Exception.Message)"
    exit 1
}
