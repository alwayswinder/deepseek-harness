# Run one detached build with output visible in its console and mirrored to disk.

param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Log,
    [switch]$Restart,
    [switch]$NoWaitOnError
)

$ErrorActionPreference = 'Stop'

$logDirectory = Split-Path -Parent $Log
if ($logDirectory -ne '') { New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$previousOutputEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = $utf8
$logWriter = New-Object System.IO.StreamWriter($Log, $true, $utf8)
$logWriter.AutoFlush = $true

function Write-BuildLine {
    param([AllowEmptyString()][string]$Message)

    Write-Host $Message
    $logWriter.WriteLine($Message)
}

$exitCode = 1
try {
    $Host.UI.RawUI.WindowTitle = 'DSH Desktop Build'

    Write-BuildLine '[build] Detached DSH build'
    Write-BuildLine "[build] Mode: $Mode"
    Write-BuildLine "[build] Log:  $Log"
    Write-BuildLine '[build] Output will stay visible here and is also being written to the log.'
    Write-BuildLine ''

    $arguments = @($Mode, '--no-pause', '--log', $Log)
    if ($Restart) { $arguments += '--restart' }

    # Windows PowerShell 5.1 wraps native stderr as a non-terminating error. Keep
    # it in the merged stream instead of letting the runner's Stop policy abort.
    $runnerErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Script @arguments 2>&1 | ForEach-Object {
            Write-BuildLine ([string]$_)
        }
    } finally {
        $ErrorActionPreference = $runnerErrorActionPreference
    }
    if ($null -ne $LASTEXITCODE) { $exitCode = [int]$LASTEXITCODE }

    Write-BuildLine ''
    if ($exitCode -eq 0) {
        Write-BuildLine '[build] Detached build finished successfully. This window will close.'
    } else {
        Write-BuildLine "[build] Detached build failed with exit code $exitCode."
        Write-BuildLine '[build] The final build lines above identify the failed step.'
        Write-BuildLine "[build] Full log: $Log"
        if (-not $NoWaitOnError) {
            Write-BuildLine '[build] Press Enter to close this window.'
            [void](Read-Host)
        }
    }
} catch {
    $runError = $_
    Write-BuildLine ''
    Write-BuildLine "[build] Detached build runner failed: $($runError.Exception.Message)"
    Write-BuildLine "[build] Full log: $Log"
    if (-not $NoWaitOnError) {
        Write-BuildLine '[build] Press Enter to close this window.'
        [void](Read-Host)
    }
    $exitCode = 1
} finally {
    $logWriter.Dispose()
    [Console]::OutputEncoding = $previousOutputEncoding
}

exit $exitCode
