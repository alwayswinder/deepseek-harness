# Stop this checkout's Desktop app before a build deletes the tree it runs from.
#
# start-desktop.bat launches Electron from the per-version cache under
# %LOCALAPPDATA% (see prepare-desktop-electron.bat) and passes this checkout's
# apps\desktop as the application path, so the executable path belongs to that
# cache and is shared by every checkout using the same Electron version. Only the
# command line names this instance: matching the image path is why the build once
# stopped nothing and then failed while removing apps\desktop\.desktop-build.
#
# The app has to be gone first because the launcher's cmd.exe redirects
# desktop.log into that directory and holds it open; `pnpm run clean` cannot
# delete the directory while it does.
#
# -DryRun reports what would be stopped and changes nothing. It exists because
# this predicate is invisible from the outside: the launcher moved Electron out
# of the checkout once already, and the build went on believing it had stopped an
# app that was still running.
#
# Exits 1 only when an instance of this checkout survives the stop, which is the
# one outcome the build must not continue past into clean.

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$application = [System.IO.Path]::GetFullPath((Join-Path $repository 'apps\desktop'))
$log = Join-Path $application '.desktop-build\development\desktop.log'

# A literal substring, not a wildcard pattern: repository paths may contain
# characters a pattern would read as syntax. One match must still count as a
# match, so every caller wraps this in @() instead of reading .Count here: a
# function's output is unrolled, and .Count on the single object is $null.
function Get-ApplicationProcesses {
    Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
        Where-Object { $null -ne $_.CommandLine -and $_.CommandLine.Contains($application) }
}

$running = @(Get-ApplicationProcesses)
if ($DryRun) {
    if ($running.Count -eq 0) { Write-Host '[build] no Electron process of this checkout is running' }
    foreach ($process in $running) {
        Write-Host ("[build] would stop pid {0}: {1}" -f $process.ProcessId, $process.CommandLine)
    }
    exit 0
}

if ($running.Count -gt 0) {
    Write-Host ("[build] Stopping {0} Electron process(es) of this checkout..." -f $running.Count)
    # SilentlyContinue, then verify: the renderers exit with their main process,
    # so a pid that has already gone is success, while one that refuses to die is
    # a fact the check below reports instead of hiding.
    $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
        Start-Sleep -Milliseconds 250
        if (@(Get-ApplicationProcesses).Count -eq 0) { break }
    }
    $remaining = @(Get-ApplicationProcesses)
    if ($remaining.Count -gt 0) {
        Write-Host ("[build] {0} Electron process(es) of this checkout are still running." -f $remaining.Count)
        exit 1
    }
}

# cmd.exe releases the log only after the app it started is gone, and the clean
# step deletes the directory holding it. Best effort: if the handle outlives this
# wait, clean reports the file it cannot remove.
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    if (-not (Test-Path -LiteralPath $log)) { break }
    try {
        $handle = [System.IO.File]::Open($log, 'Open', 'ReadWrite', 'None')
        $handle.Close()
        break
    } catch {
        # Still held by the launcher; wait for it to exit.
        Start-Sleep -Milliseconds 250
    }
}

exit 0
