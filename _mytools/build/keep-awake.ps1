<#
.SYNOPSIS
    在长时间桌面自动化任务期间阻止 Windows 因空闲自动锁屏。

.DESCRIPTION
    本机策略 HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\InactivityTimeoutSecs
    设为 1200 秒：连续 20 分钟没有键盘鼠标输入就锁屏。锁屏后桌面会话切到 Winlogon 安全桌面，
    CUA 的点击、键盘与截图全部失效，正在跑的豆包任务会中断。

    本脚本以固定间隔发送零位移鼠标事件，重置 GetLastInputInfo 的空闲计时，从而不触发锁屏。
    只应在需要时启动，任务结束后用 -Action stop 关闭；它不会修改任何系统策略或电源设置。

.EXAMPLE
    .\keep-awake.ps1 -Action start
.EXAMPLE
    .\keep-awake.ps1 -Action status
.EXAMPLE
    .\keep-awake.ps1 -Action stop
#>
param(
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'start',
    [int]$IntervalSeconds = 25
)

$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $env:TEMP 'dsh-keep-awake.pid'

function Get-Keeper {
    if (-not (Test-Path $pidFile)) { return $null }
    $saved = (Get-Content $pidFile -Raw).Trim()
    if (-not $saved) { return $null }
    Get-Process -Id $saved -ErrorAction SilentlyContinue
}

switch ($Action) {
    'status' {
        $keeper = Get-Keeper
        if ($keeper) { "running pid=$($keeper.Id)" } else { 'not running' }
        break
    }
    'stop' {
        $keeper = Get-Keeper
        if ($keeper) {
            Stop-Process -Id $keeper.Id -Force
            "stopped pid=$($keeper.Id)"
        }
        else {
            'not running'
        }
        Remove-Item $pidFile -ErrorAction SilentlyContinue
        break
    }
    'start' {
        $keeper = Get-Keeper
        if ($keeper) {
            "already running pid=$($keeper.Id)"
            break
        }
        if ($IntervalSeconds -lt 5) { throw "IntervalSeconds must be >= 5, got $IntervalSeconds" }

        $innerPath = Join-Path $env:TEMP 'dsh-keep-awake-inner.ps1'
        @'
param([int]$Seconds)
$ErrorActionPreference = "Stop"
Add-Type -Namespace Dsh -Name Idle -MemberDefinition @"
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
"@
while ($true) {
    [Dsh.Idle]::mouse_event(0x0001, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Seconds $Seconds
}
'@ | Set-Content -Path $innerPath -Encoding utf8

        $proc = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-File', $innerPath, '-Seconds', $IntervalSeconds
        )
        Set-Content -Path $pidFile -Value $proc.Id -Encoding utf8
        "started pid=$($proc.Id) interval=${IntervalSeconds}s"
        break
    }
}
