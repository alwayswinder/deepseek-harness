# Start a build outside this process tree, so it outlives the app it rebuilds.
#
# A build that rebuilds the Desktop app has to stop that app, and every process
# started from inside it - an agent's shell, this launcher - dies with it. WMI
# creates the process instead, so its parent is the WMI provider rather than the
# app, and the build keeps running after Electron is gone. A dedicated runner
# keeps the output visible in that process's console and mirrors it to the log.

param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string]$Mode,
    [string]$Log = '',
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

if ($Log -eq '') {
    $Log = Join-Path (Resolve-DshHome) ('build\logs\build-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$logDirectory = Split-Path -Parent $Log
if ($logDirectory -ne '') { New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null }

$runner = Join-Path $PSScriptRoot 'run-detached-build.ps1'
$powershell = Join-Path $PSHOME 'powershell.exe'
$restartFlag = if ($Restart) { ' -Restart' } else { '' }
# WMI receives one Windows command line, so quote every path at the layer that
# creates it. Windows paths cannot contain a double quote.
$commandLine = '"{0}" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "{1}" -Script "{2}" -Mode "{3}" -Log "{4}"{5}' -f `
    $powershell, $runner, $Script, $Mode, $Log, $restartFlag

$started = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
if ($started.ReturnValue -ne 0) {
    Write-Host "[build] Could not start the detached build (WMI return value $($started.ReturnValue))."
    exit 1
}

Write-Host "[build] Detached build started (process id $($started.ProcessId))."
Write-Host "[build] Mode: $Mode."
Write-Host "[build] Log:  $Log"
Write-Host '[build] The app is closed while it builds; the outcome lands in'
Write-Host '[build]   $DSH_HOME\build\last-build.json'
exit 0
