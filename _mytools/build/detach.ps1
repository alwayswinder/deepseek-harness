# Start a build outside this process tree, so it outlives the app it rebuilds.
#
# A build that rebuilds the Desktop app has to stop that app, and every process
# started from inside it - an agent's shell, this launcher - dies with it. WMI
# creates the process instead, so its parent is the WMI provider rather than the
# app, and the build keeps running after Electron is gone. Its output is the log
# file, because the process has no console to print to.

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

$restartFlag = if ($Restart) { ' --restart' } else { '' }
# The child is a shell command: it runs the batch, keeps its console output out
# of the way, and appends that output to the log. Quoting is built here rather
# than in the caller because this is the layer that knows the Windows rules.
$commandLine = '{0} /c ""{1}" {2} --no-pause --log "{3}"{4} >> "{3}" 2>&1"' -f `
    $env:COMSPEC, $Script, $Mode, $Log, $restartFlag

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
