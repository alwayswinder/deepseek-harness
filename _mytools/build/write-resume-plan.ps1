# Write the "update + build" contract for a detached build that will outlive the
# calling session: what was about to be built, at which revision, where the log
# went, and which artifacts must exist afterwards. update-and-build.bat calls
# this right before handing off to build.bat --detached --restart, so a later
# turn (after the app comes back) can verify the build from resume-plan.json +
# last-build.json without replaying it.

param(
    [Parameter(Mandatory = $true)][string]$Repo,
    [string]$Revision = '',
    [string]$State = 'starting',
    [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

$dshHome = Resolve-DshHome
$stateDirectory = Join-Path $dshHome 'build'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

if ($LogPath -eq '') {
    $LogPath = Join-Path $stateDirectory ('logs\update-build-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$logDirectory = Split-Path -Parent $LogPath
if ($logDirectory -ne '') { New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null }

$rev = $Revision
if ($rev -eq '') {
    try { $rev = (& git -C $Repo rev-parse HEAD 2>$null | Select-Object -First 1).Trim() } catch { $rev = '' }
}

$expectedArtifacts = @(
    'apps\cli\lib\bin.js',
    'apps\cli\lib\profile-boot.js',
    'apps\desktop\lib\main.js',
    'apps\desktop-host\lib\index.js',
    'apps\web\dist\index.html',
    'apps\desktop\node_modules\electron\dist\electron.exe',
    'apps\desktop\.desktop-build\development\project\desktop-runtime.json',
    'apps\desktop\.desktop-build\targets\win-x64\runtime\primary-runtime\runtime.json'
)

$plan = [ordered]@{
    kind              = 'update-and-build'
    state             = $State
    repository        = $Repo
    dshHome           = $dshHome
    revision          = $rev
    logPath           = $LogPath
    expectedArtifacts = $expectedArtifacts
    updatedAt         = (Get-Date).ToString('o')
}

$statePath = Join-Path $stateDirectory 'resume-plan.json'
$json = $plan | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($statePath, $json, (New-Object System.Text.UTF8Encoding($false)))

# The one line a caller (update-and-build.bat) captures to learn where the log
# went; nothing else writes to stdout.
Write-Output $LogPath