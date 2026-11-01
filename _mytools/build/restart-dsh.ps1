# Restart the repository Desktop app after a host-side plugin change.
#
# The app runs this session, so stopping it kills whatever called this script. It is therefore
# started through WMI (parent = WMI provider) and waits before touching Electron, which gives the
# caller time to finish its turn and have its reply delivered.
#
# Usage: restart-dsh.ps1 [-DelaySeconds 30]

param(
    [int]$DelaySeconds = 30
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

$dshHome = Resolve-DshHome
$node = (Get-Command node.exe).Source
$cli = Join-Path $dshHome 'profiles\desktop\node_modules\dsh-wechat-plugin\cli.js'

function Send-WeChat([string]$Text) {
    if (-not (Test-Path $cli)) { return }
    try { & $node $cli $Text 2>&1 | Out-Null }
    catch {
        # Best effort: the restart is what matters, the notice is a courtesy.
    }
}

Start-Sleep -Seconds $DelaySeconds

$main = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
    Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'development-electron' }

foreach ($process in $main) {
    & taskkill.exe /PID $process.ProcessId /T /F 2>$null | Out-Null
}

Start-Sleep -Seconds 4

Start-Process -FilePath (Join-Path $PSScriptRoot 'start-desktop.bat') -WindowStyle Hidden

# Wait for the app to come back before saying anything: a message claiming recovery while the
# process is still down would be the one thing worse than silence.
$deadline = (Get-Date).AddSeconds(120)
$up = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 4
    $alive = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
        Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'development-electron' }
    if ($null -ne $alive) { $up = $true; break }
}

if ($up) {
    Send-WeChat '回来了。刚才重启了一次，是为了让切会话的补丁生效——以后不会再有消息漏掉，也不会告诉你切到哪个对话。'
}
else {
    Send-WeChat '重启后没等到程序起来，可能失败了，得你看一眼电脑。'
}
