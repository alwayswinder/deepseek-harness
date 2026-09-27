# Record the outcome of one build run and, when asked, bring the app back.
#
# Every build path ends here, so `$DSH_HOME\build\last-build.json` is the one
# place a later reader (a person, or an agent in a fresh turn) can learn what the
# last build did without replaying it: the mode, the step it reached, the exit
# code, the revision it built, and where the full log is when the run was
# detached. The console output of a detached run is that log file.

param(
    [Parameter(Mandatory = $true)][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)][int]$ExitCode,
    [string]$LogPath = '',
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

$dshHome = Resolve-DshHome
$stateDirectory = Join-Path $dshHome 'build'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$revision = ''
try {
    $revision = (& git -C $repository rev-parse HEAD 2>$null | Select-Object -First 1)
} catch {
    # Not a checkout, or git is unavailable: the result still reports the rest.
}
if ($null -eq $revision) { $revision = '' }
$revision = $revision.Trim()

$ok = $ExitCode -eq 0
$result = [ordered]@{
    mode       = $Mode
    step       = $Step
    exitCode   = $ExitCode
    ok         = $ok
    revision   = $revision
    logPath    = $LogPath
    finishedAt = (Get-Date).ToString('o')
    repository = $repository
    dshHome    = $dshHome
}
$statePath = Join-Path $stateDirectory 'last-build.json'
# Written without a byte-order mark: a JSON reader that does not strip one would
# reject the whole file.
$json = $result | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($statePath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
if ($ok) {
    Write-Host "[build] Completed successfully (mode: $Mode)."
} else {
    Write-Host "[build] Failed in step '$Step' with exit code $ExitCode."
}
Write-Host "[build] Result: $statePath"
if ($LogPath -ne '' -and (Test-Path -LiteralPath $LogPath)) { Write-Host "[build] Log:    $LogPath" }

if ($Restart -and $ok) {
    $launcher = Join-Path $PSScriptRoot 'start-desktop.bat'
    if (Test-Path -LiteralPath $launcher) {
        Write-Host '[build] Starting the Desktop app on this build...'
        Start-Process -FilePath $launcher -WorkingDirectory (Split-Path -Parent $launcher) | Out-Null
    } else {
        Write-Host "[build] No start-desktop.bat next to this script; start the app yourself."
    }
} elseif ($Restart) {
    Write-Host '[build] Not restarting: the build did not finish, so the app would not start from it.'
    Write-Host '[build] Fix the failure above (or read the log), then run start-desktop.bat.'
}
