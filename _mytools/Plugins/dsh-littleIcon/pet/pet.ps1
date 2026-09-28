<#
.SYNOPSIS
    The DSH pet window: a frameless, transparent, always-on-top widget that lives
    independently of the DSH window.

.DESCRIPTION
    Started by the host half of dsh-littleIcon (see ../index.js). Every 200ms the
    script re-reads the state file the host writes (it rewrites on change, plus a
    heartbeat) and applies the expression animation, window size, opacity, and
    click behaviour from it. Dragging stores the window position in PositionFile.
    A press that did not move the window counts as a click: user32 ShowWindow
    tucks the DSH window away or brings it back. The state file also carries a
    tuck request, which the host raises once the user leaves DSH untouched for the
    configured stretch, and which hides the window exactly like a click does. A
    right-click on the pet and the tray icon show the same menu; an entry the page
    carries out (the chat site, or the plugin's own Git page) brings DSH back on
    screen first and is written to command.json beside the state file for the host
    to relay, and the rest act on this process at once. Ending DSH is one of those:
    the window's own close only hides it now, so that entry ends the process every
    part of DSH runs under instead (see Stop-DshWindow). Restarting is the same
    ending plus a replacement, which a detached waiter starts once DSH is gone
    because this pet does not outlive it (see Restart-DshWindow).

    The target window is located through DshPid (the host's parent, i.e. the
    Electron main process): Process.MainWindowHandle first, then an enumeration
    of that process's top-level windows that skips IME helper windows. The handle
    is cached, because MainWindowHandle reports 0 once the window is hidden.

    This script is deliberately ASCII-only so Windows PowerShell 5.1 decodes it
    the same way whatever encoding an editor saves: the localized tray labels
    live in labels.json and are read as UTF-8.

.PARAMETER AssetDir
    Animation root: one subdirectory per state holding 1.png ... N.png, plus
    tray.ico and labels.json.

.PARAMETER StateFile
    The JSON state file the host writes.

.PARAMETER PositionFile
    JSON file holding only the window x/y.

.PARAMETER DshPid
    DSH main process id; 0 means no window control (the web profile).

.PARAMETER SelfTest
    Print the loaded labels and the asset inventory, then exit, so a broken script
    fails before the next DSH start.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AssetDir,
    [Parameter(Mandatory = $true)][string]$StateFile,
    [Parameter(Mandatory = $true)][string]$PositionFile,
    [int]$DshPid = 0,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell has no DPI manifest, so the process starts DPI-unaware. A
# layered (AllowsTransparency) window in an unaware process is rendered into a
# surface at the virtualized size and then stretched by the system, which tiles
# the pet's content and draws the window larger than asked. Declare awareness
# before any window exists so WPF renders the layered surface at device
# resolution; this must run first, before Add-Type touches any UI assembly.
if (-not ('DshPet.Dpi' -as [type])) {
    Add-Type -Namespace DshPet -Name Dpi -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);
[System.Runtime.InteropServices.DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
}
# Per-monitor v2, then per-monitor, then system: the newest call the OS accepts.
$dpiAware = [DshPet.Dpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
if (-not $dpiAware) {
    try { $dpiAware = ([DshPet.Dpi]::SetProcessDpiAwareness(2) -eq 0) } catch { $dpiAware = $false }
}
if (-not $dpiAware) { $dpiAware = [DshPet.Dpi]::SetProcessDPIAware() }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml, System.Windows.Forms, System.Drawing

# ---- paths and labels -------------------------------------------------------
$SCRIPT:ScriptDir = if ([string]::IsNullOrEmpty($PSScriptRoot)) { (Get-Location).Path } else { $PSScriptRoot }
$SCRIPT:AssetDir = (Resolve-Path -LiteralPath $AssetDir).Path
$SCRIPT:StateFile = [System.IO.Path]::GetFullPath($StateFile)
$SCRIPT:PositionFile = [System.IO.Path]::GetFullPath($PositionFile)
# Next to the state file, like the position: this pet is the process that tucks
# DSH away, so it is the one that knows whether the window is on screen and
# whether it is the window in front. The host needs both - the first picks the
# tucked sleep timer, the second decides whether an idle DSH should be tucked.
$SCRIPT:WindowFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'window.json'
# Where a menu entry chosen on the pet is handed to the host, which alone can
# reach the page: the pet cannot touch the DSH window's content, and the page
# cannot see this window's menu.
$SCRIPT:CommandFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'command.json'
# The host's request for this pet to quit. It exists because the tray icon belongs
# to this process: a pet that is killed outright leaves its icon in the tray as a
# ghost until the shell notices, which is one dead icon per restart, so the host
# asks instead and only kills a pet that does not answer.
$SCRIPT:QuitFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'quit'
$SCRIPT:WindowVisible = $null
$SCRIPT:WindowForeground = $null
$SCRIPT:DshPid = $DshPid

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Get-Labels {
    $fallback = [ordered]@{
        TrayTip               = 'DSH pet'
        Chat                  = 'Chat'
        Git                   = 'Git changes'
        ToggleShown           = 'Tuck DSH away'
        ToggleHidden          = 'Show DSH'
        Reset                 = 'Move to corner'
        RestartDsh            = 'Restart DSH'
        RestartDshConfirm     = 'Restart DSH? A running task will be interrupted.'
        RestartDshUnavailable = 'Could not read how DSH was started, so it was left alone. Start it yourself.'
        RestartDshFailed      = 'The restart could not be prepared, so DSH was left alone.'
        QuitDsh               = 'Quit DSH'
        QuitDshConfirm        = 'Quit DSH? A running task will be interrupted.'
    }
    $path = Join-Path $SCRIPT:ScriptDir 'labels.json'
    if (-not (Test-Path -LiteralPath $path)) { return $fallback }
    try {
        $parsed = (Read-Utf8Text $path) | ConvertFrom-Json
        $labels = [ordered]@{}
        foreach ($key in $fallback.Keys) {
            $value = $parsed.$key
            $labels[$key] = if ([string]::IsNullOrWhiteSpace($value)) { $fallback[$key] } else { [string]$value }
        }
        return $labels
    } catch {
        [Console]::Error.WriteLine("labels.json unreadable, using defaults: $($_.Exception.Message)")
        return $fallback
    }
}

$SCRIPT:Labels = Get-Labels

# IME helper windows carry titles too, so they are filtered by window class.
$SCRIPT:HelperWindowClasses = @('IME', 'MSCTFIME UI', 'CandidateWindow', 'Mode Indicator', 'Default IME')

# SW_HIDE removes the window from both the screen and the taskbar, which leaves
# the pet and the tray as the way back; SW_MINIMIZE keeps the taskbar entry;
# SW_RESTORE shows and activates.
$SCRIPT:SwHide = 0
$SCRIPT:SwMinimize = 6
$SCRIPT:SwRestore = 9

# Custom window message the Electron main process listens for (its hook lives in
# apps/desktop main.ts, tracked in UPSTREAM.md). Posting it after an external
# restore asks Electron to run its own show(), which flips the page's hidden
# visibilityState back to visible; without it a window hidden via the title-bar
# X comes back showing a frozen frame. Must match main.ts's constant.
$SCRIPT:LittleIconShowWindowMessage = 0x8001

# GetWindowLong/SetWindowLong index for the extended window style.
$SCRIPT:GwlExStyle = -20

# How long the waiter waits after DSH is gone before the replacement starts. DSH
# flushes its sessions and stops its agents while it shuts down; starting the next
# instance on top of that would put two hosts on the same session store.
$SCRIPT:RelaunchDelaySeconds = 4

# The launcher's own command line, carried to the waiter in the environment
# rather than spliced into a command line of our own: cmd expands this variable,
# so nothing here has to quote or re-parse what DSH was started with.
$SCRIPT:RelaunchVariable = 'DSH_RELAUNCH_CMD'

$SCRIPT:Frames = @{}
$SCRIPT:FrameCounts = @{}
$SCRIPT:DshWindow = [IntPtr]::Zero
$SCRIPT:Expression = ''
$SCRIPT:FrameIndex = 1
$SCRIPT:FrameCount = 4
$SCRIPT:FrameMs = 600
$SCRIPT:IdleOpacity = 0.45
$SCRIPT:Hovered = $false
$SCRIPT:Pressed = $false
$SCRIPT:PendingClick = $false
$SCRIPT:PressX = 0
$SCRIPT:PressY = 0
$SCRIPT:ClickAction = 'toggle'
$SCRIPT:LastFrameAt = 0
$SCRIPT:StateStamp = [DateTime]::MinValue
$SCRIPT:Ticks = 0
$SCRIPT:TrayIcon = $null
$SCRIPT:Notify = $null
$SCRIPT:PetMenu = $null
$SCRIPT:ToggleItems = @()
$SCRIPT:Exiting = $false

function Write-Log([string]$Message) {
    [Console]::Error.WriteLine($Message)
}

function Read-Json([string]$Path) {
    try {
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        $text = Read-Utf8Text $Path
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return ($text | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Write-Json([string]$Path, $Value) {
    try {
        $directory = [System.IO.Path]::GetDirectoryName($Path)
        if (-not [string]::IsNullOrEmpty($directory) -and -not (Test-Path -LiteralPath $directory)) {
            [void][System.IO.Directory]::CreateDirectory($directory)
        }
        $json = ($Value | ConvertTo-Json -Compress)
        [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
    } catch {
        Write-Log "cannot save $Path : $($_.Exception.Message)"
    }
}

function Get-FrameAsset([string]$State, [int]$Index) {
    $key = "$State/$Index"
    if ($SCRIPT:Frames.ContainsKey($key)) { return $SCRIPT:Frames[$key] }
    $path = Join-Path (Join-Path $SCRIPT:AssetDir $State) "$Index.png"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
    $bitmap.BeginInit()
    # OnLoad decodes immediately: the file stays replaceable and unlocked.
    $bitmap.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $bitmap.UriSource = New-Object System.Uri($path)
    $bitmap.EndInit()
    $bitmap.Freeze()
    $SCRIPT:Frames[$key] = $bitmap
    return $bitmap
}

function Get-FrameCount([string]$State) {
    # The art decides the frame count (most states are 4, working is 6), so count
    # the files instead of trusting a constant in the host.
    if ($SCRIPT:FrameCounts.ContainsKey($State)) { return $SCRIPT:FrameCounts[$State] }
    $count = 0
    while (Test-Path -LiteralPath (Join-Path (Join-Path $SCRIPT:AssetDir $State) "$($count + 1).png")) {
        $count++
    }
    $SCRIPT:FrameCounts[$State] = $count
    return $count
}

# ---- restart ----------------------------------------------------------------
function Get-DshLaunchCommand {
    # A replacement has to start the way the running one did, and the only place
    # that knows is the process itself: its command line is what its launcher
    # wrote (start-dsh-service.vbs builds it). .NET's Process exposes no command
    # line, so it comes from WMI; a machine where that fails leaves DSH running
    # rather than ending it without a way back.
    try {
        $process = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$SCRIPT:DshPid" -ErrorAction Stop
        if ($null -eq $process) { return $null }
        $command = [string]$process.CommandLine
        if ([string]::IsNullOrWhiteSpace($command)) { return $null }
        return $command.Trim()
    } catch {
        Write-Log "reading the DSH command line failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-RelaunchDirectory([string]$CommandLine) {
    # The launcher's working directory anchors relative paths, and the one it
    # passes is the application directory quoted in this command line (see
    # start-dsh-service.vbs). The last quoted token that names a directory is
    # therefore where the replacement starts; nothing found keeps this process's
    # own directory, which is a real one either way.
    $quoted = [regex]::Matches($CommandLine, '"([^"]+)"')
    for ($index = $quoted.Count - 1; $index -ge 0; $index--) {
        $candidate = $quoted[$index].Groups[1].Value
        if (Test-Path -LiteralPath $candidate -PathType Container) { return $candidate }
    }
    return $null
}

function New-RelaunchScript([int]$WaitForPid, [string]$Directory, [int]$DelaySeconds) {
    # The script the detached waiter runs. It holds no copy of the command line:
    # cmd expands the variable this pet put in the environment, which is what
    # keeps quoting and non-ASCII paths out of every layer between here and there.
    $lines = @(
        "while (Get-Process -Id $WaitForPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }",
        "Start-Sleep -Seconds $DelaySeconds",
        # This pet runs under the Host, which runs under Electron in Node mode, so
        # the whole tree carries ELECTRON_RUN_AS_NODE=1; an Electron started with
        # it boots as a plain Node process and dies on the app's first import
        # instead of opening a window. It is dropped here, where the replacement's
        # environment is decided, and nowhere earlier: the pet itself still needs
        # the environment it was given.
        "Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue"
    )
    if (-not [string]::IsNullOrWhiteSpace($Directory)) {
        $lines += "Set-Location -LiteralPath '$($Directory.Replace("'", "''"))'"
    }
    $lines += "Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c','%$SCRIPT:RelaunchVariable%' -WindowStyle Hidden"
    return ($lines -join "`r`n")
}

function Set-RelaunchCommand([string]$CommandLine) {
    # The waiter's cmd expands this variable, which is what keeps the launcher's
    # line out of any argument list of ours. It is set through .NET rather than
    # `$env[$name]`: a computed name cannot index the provider-backed variable in
    # Windows PowerShell ("Cannot index into a null array"), and that failure
    # happens before anything is killed, so it looks exactly like the menu entry
    # doing nothing at all.
    [System.Environment]::SetEnvironmentVariable($SCRIPT:RelaunchVariable, $CommandLine)
}

function Start-RelaunchHelper([string]$CommandLine) {
    # The waiter has to outlive this pet: ending DSH unloads the plugin, whose
    # cleanup ends the pet, so nothing this process is still doing can start the
    # replacement. It is started hidden and detached (Start-Process creates it
    # outside this window, and a killed parent does not take its children with it
    # on Windows), waits for DSH to go, and only then runs the launcher's line.
    Set-RelaunchCommand $CommandLine
    $script = New-RelaunchScript -WaitForPid $SCRIPT:DshPid `
        -Directory (Get-RelaunchDirectory $CommandLine) -DelaySeconds $SCRIPT:RelaunchDelaySeconds
    # -EncodedCommand carries the script as UTF-16 data, so the quotes, newlines
    # and paths inside it never reach a command line parser.
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($script))
    $shell = (Get-Process -Id $PID).Path
    if ([string]::IsNullOrWhiteSpace($shell)) { $shell = 'powershell.exe' }
    [void](Start-Process -FilePath $shell `
        -ArgumentList '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', $encoded `
        -WindowStyle Hidden)
}

# Report a restart that could not be prepared, in the same box the entry's own
# confirmation uses: the person asked for something, and silence would read as a
# dead menu entry rather than as "DSH was left alone".
function Show-RestartFailure([string]$Detail) {
    $text = $SCRIPT:Labels.RestartDshFailed
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { $text = "$text`n`n$Detail" }
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, $text,
        $SCRIPT:Labels.TrayTip, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

function Restart-DshWindow {
    # Ending DSH and having it come back. The waiter is armed first so a failure
    # to arm it leaves the app running, and DSH is ended only once the way back
    # exists.
    if ($SCRIPT:DshPid -le 0) { return }
    $command = Get-DshLaunchCommand
    if ($null -eq $command) {
        Show-RestartFailure $SCRIPT:Labels.RestartDshUnavailable
        return
    }
    try {
        Start-RelaunchHelper $command
        Write-Log "restarting DSH after it exits: $command"
    } catch {
        Write-Log "arming the restart failed: $($_.Exception.Message)"
        Show-RestartFailure $_.Exception.Message
        return
    }
    Stop-DshWindow
}

# ---- self test --------------------------------------------------------------
if ($SelfTest) {
    $states = @(Get-ChildItem -LiteralPath $SCRIPT:AssetDir -Directory | Sort-Object Name | ForEach-Object {
        "$($_.Name)=$(Get-FrameCount $_.Name)"
    })
    Write-Output "labels: $($SCRIPT:Labels.Chat) / $($SCRIPT:Labels.Git) / $($SCRIPT:Labels.ToggleShown) / $($SCRIPT:Labels.ToggleHidden) / $($SCRIPT:Labels.Reset) / $($SCRIPT:Labels.RestartDsh) / $($SCRIPT:Labels.QuitDsh)"
    Write-Output "assets: $($states -join ', ')"
    Write-Output "state-file: $SCRIPT:StateFile"
    # Restarting ends DSH, so no test may exercise it end to end; what is worth
    # checking is the part a wrong edit would ruin silently - which directory the
    # replacement starts in, and the script the waiter would run, down to the
    # variable cmd is meant to expand.
    $sample = '"{0}\System32\notepad.exe" "--flag=1" "{1}"' -f $env:SystemRoot, $SCRIPT:AssetDir
    $directory = Get-RelaunchDirectory $sample
    Write-Output "relaunch-dir: $(if ($null -eq $directory) { '(none)' } else { $directory })"
    $plan = New-RelaunchScript -WaitForPid 4321 -Directory 'C:\somewhere' -DelaySeconds $SCRIPT:RelaunchDelaySeconds
    Write-Output "relaunch-script: $($plan -replace "`r`n", ' >> ')"
    # Arming is the step that decides whether the replacement finds the launcher's
    # line at all, and it is the one Windows PowerShell broke silently; the value
    # read back is what the waiter's cmd will expand.
    Set-RelaunchCommand 'relaunch probe'
    Write-Output "relaunch-variable: $([System.Environment]::GetEnvironmentVariable($SCRIPT:RelaunchVariable))"
    exit 0
}

# ---- single instance --------------------------------------------------------
# One pet per harness home, not one per machine: the name is derived from the
# state file, so a second DSH sharing this directory cannot stack a second pet on
# the same window while a test using its own temporary home still can run one.
$SCRIPT:MutexName = 'Local\dsh-littleIcon-pet-' + [BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($SCRIPT:StateFile.ToLowerInvariant()))).Replace('-', '').Substring(0, 16)
$SCRIPT:Mutex = New-Object System.Threading.Mutex($false, $SCRIPT:MutexName)
if (-not $SCRIPT:Mutex.WaitOne(0)) {
    Write-Log 'another pet is already running; exiting'
    exit 0
}

# ---- window control (user32) ------------------------------------------------
if (-not ('DshPet.Win32' -as [type])) {
    Add-Type -Namespace DshPet -Name Win32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindow(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, System.IntPtr extra);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int GetWindowTextLength(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int GetWindowLong(System.IntPtr hWnd, int index);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int SetWindowLong(System.IntPtr hWnd, int index, int value);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern int GetClassName(System.IntPtr hWnd, System.Text.StringBuilder name, int max);
public delegate bool EnumProc(System.IntPtr hWnd, System.IntPtr extra);
'@
}

# ---- pet window -------------------------------------------------------------
$window = New-Object System.Windows.Window
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.ShowInTaskbar = $false
$window.Topmost = $true
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.SizeToContent = [System.Windows.SizeToContent]::Manual
# The pet must never take the input focus away from what the user is doing.
$window.ShowActivated = $false
$window.Width = 160
$window.Height = 160
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual

$image = New-Object System.Windows.Controls.Image
$image.Stretch = [System.Windows.Media.Stretch]::Uniform
[System.Windows.Media.RenderOptions]::SetBitmapScalingMode($image, [System.Windows.Media.BitmapScalingMode]::HighQuality)
$window.Content = $image

$app = New-Object System.Windows.Application
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

# Window.Left/Top are device-independent units, and WPF scales them by the
# display DPI. WinForms reports the work area and the virtual screen in physical
# pixels instead, so mixing the two puts the pet off-screen at any scaling other
# than 100% (at 150% a "bottom-right" position lands 1.5x too far right and down).
# SystemParameters is WPF's own DIP geometry and matches Window.Left/Top.
function Get-VirtualScreen {
    return [System.Windows.Rect]::new(
        [System.Windows.SystemParameters]::VirtualScreenLeft,
        [System.Windows.SystemParameters]::VirtualScreenTop,
        [System.Windows.SystemParameters]::VirtualScreenWidth,
        [System.Windows.SystemParameters]::VirtualScreenHeight)
}

function Set-PetPosition([double]$X, [double]$Y) {
    $bounds = Get-VirtualScreen
    $maxX = [Math]::Max($bounds.Left, $bounds.Right - $window.Width)
    $maxY = [Math]::Max($bounds.Top, $bounds.Bottom - $window.Height)
    $window.Left = [Math]::Min([Math]::Max($X, $bounds.Left), $maxX)
    $window.Top = [Math]::Min([Math]::Max($Y, $bounds.Top), $maxY)
}

function Set-DefaultPosition {
    # WorkArea is the primary monitor's area minus the taskbar, in the same units.
    $area = [System.Windows.SystemParameters]::WorkArea
    Set-PetPosition ($area.Right - $window.Width - 24) ($area.Bottom - $window.Height - 24)
}

function Restore-Position {
    $saved = Read-Json $SCRIPT:PositionFile
    if ($null -ne $saved -and $null -ne $saved.x -and $null -ne $saved.y) {
        Set-PetPosition ([double]$saved.x) ([double]$saved.y)
        return
    }
    Set-DefaultPosition
}

function Save-Position {
    Write-Json $SCRIPT:PositionFile ([ordered]@{ x = [int]$window.Left; y = [int]$window.Top })
}

function Update-PetOpacity {
    if ($SCRIPT:Hovered) { $window.Opacity = 1.0 }
    else { $window.Opacity = $SCRIPT:IdleOpacity }
}

function Show-CurrentFrame {
    $bitmap = Get-FrameAsset $SCRIPT:Expression $SCRIPT:FrameIndex
    if ($null -ne $bitmap) { $image.Source = $bitmap }
}

function Set-Expression([string]$State) {
    if ($State -eq $SCRIPT:Expression) { return }
    $SCRIPT:Expression = $State
    $SCRIPT:FrameIndex = 1
    $SCRIPT:LastFrameAt = [Environment]::TickCount
    $SCRIPT:FrameCount = [Math]::Max(1, (Get-FrameCount $State))
    Show-CurrentFrame
}

function Set-PetSize([int]$Size) {
    $size = [Math]::Max(64, [Math]::Min(512, $Size))
    if ([int]$window.Width -eq $size) { return }
    $window.Width = $size
    $window.Height = $size
}

function Apply-State($State) {
    if ($null -eq $State) { return }
    if ($null -ne $State.frameMs) { $SCRIPT:FrameMs = [Math]::Max(120, [int]$State.frameMs) }
    if ($null -ne $State.opacity) { $SCRIPT:IdleOpacity = [double]$State.opacity }
    if ($null -ne $State.clickAction) { $SCRIPT:ClickAction = [string]$State.clickAction }
    if ($null -ne $State.size) { Set-PetSize ([int]$State.size) }
    if ($null -ne $State.topmost) { $window.Topmost = [bool]$State.topmost }
    if ($null -ne $State.state) { Set-Expression ([string]$State.state) }
    # The host asks for a tuck once the user has left DSH untouched long enough;
    # the request says nothing about the current window state, so it only ever
    # hides, and hiding an already hidden window is a no-op.
    if ($null -ne $State.tuck -and [bool]$State.tuck) { Set-DshWindowShown $false }
    Update-PetOpacity
}

# ---- the DSH window ---------------------------------------------------------
function Find-DshWindow {
    if ($SCRIPT:DshWindow -ne [IntPtr]::Zero -and [DshPet.Win32]::IsWindow($SCRIPT:DshWindow)) {
        return $SCRIPT:DshWindow
    }
    $SCRIPT:DshWindow = [IntPtr]::Zero
    if ($SCRIPT:DshPid -le 0) { return [IntPtr]::Zero }

    $process = Get-Process -Id $SCRIPT:DshPid -ErrorAction SilentlyContinue
    if ($null -ne $process -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
        $SCRIPT:DshWindow = $process.MainWindowHandle
        return $SCRIPT:DshWindow
    }

    # MainWindowHandle reports 0 for a hidden window, so enumerate instead: keep
    # the first titled, visible-or-minimized top-level window that is not an IME
    # helper.
    $callback = [DshPet.Win32+EnumProc]{
        param([IntPtr]$Handle, [IntPtr]$Extra)
        $owner = 0
        [void][DshPet.Win32]::GetWindowThreadProcessId($Handle, [ref]$owner)
        if ($owner -ne $SCRIPT:DshPid) { return $true }
        if ([DshPet.Win32]::GetWindowTextLength($Handle) -le 0) { return $true }
        if (-not ([DshPet.Win32]::IsWindowVisible($Handle) -or [DshPet.Win32]::IsIconic($Handle))) { return $true }
        $buffer = New-Object System.Text.StringBuilder 256
        [void][DshPet.Win32]::GetClassName($Handle, $buffer, 256)
        if ($SCRIPT:HelperWindowClasses -contains $buffer.ToString()) { return $true }
        $SCRIPT:DshWindow = $Handle
        return $false
    }
    [void][DshPet.Win32]::EnumWindows($callback, [IntPtr]::Zero)
    return $SCRIPT:DshWindow
}

function Get-DshShown {
    $handle = Find-DshWindow
    if ($handle -eq [IntPtr]::Zero) { return $true }
    return ([DshPet.Win32]::IsWindowVisible($handle) -and -not [DshPet.Win32]::IsIconic($handle))
}

function Get-DshForeground {
    # What the host acts on is "somebody else is in front", so a window of DSH's
    # own process (a dialog, the update prompt) and this pet's own window still
    # count as DSH being what the user is looking at.
    $handle = [DshPet.Win32]::GetForegroundWindow()
    if ($handle -eq [IntPtr]::Zero) { return $false }
    $owner = 0
    [void][DshPet.Win32]::GetWindowThreadProcessId($handle, [ref]$owner)
    return ($owner -eq $SCRIPT:DshPid -or $owner -eq $PID)
}

function Update-MenuLabels {
    # Every menu carrying the toggle shows the state it will produce, not the one
    # it was built with.
    foreach ($item in $SCRIPT:ToggleItems) {
        if ($null -eq $item) { continue }
        if (Get-DshShown) { $item.Text = $SCRIPT:Labels.ToggleShown }
        else { $item.Text = $SCRIPT:Labels.ToggleHidden }
    }
}

function Set-DshWindowShown([bool]$Shown) {
    if ($SCRIPT:DshPid -le 0) { return }
    $handle = Find-DshWindow
    if ($handle -eq [IntPtr]::Zero) {
        Write-Log 'DSH window not found; ignoring this window command'
        return
    }
    # Already where it is wanted: a repeated request must not undo anything. The
    # host rewrites its state file and the timer re-reads it, so the auto-tuck
    # request arrives more than once.
    if ($Shown -eq (Get-DshShown)) { return }
    if ($Shown) {
        [void][DshPet.Win32]::ShowWindow($handle, $SCRIPT:SwRestore)
        [void][DshPet.Win32]::SetForegroundWindow($handle)
        # Electron hid this window when its title-bar X was used, and throttles
        # the renderer while hidden. ShowWindow above brings the OS window back,
        # but Chromium keeps the page visibilityState hidden - the restored
        # window shows a frozen frame. Tell the Electron main process, which
        # listens for this message and re-runs its own show() to flip the page
        # back to visible. Without it the window stays stuck after the X path.
        [void][DshPet.Win32]::PostMessage($handle, $SCRIPT:LittleIconShowWindowMessage, [IntPtr]::Zero, [IntPtr]::Zero)
    } else {
        [void][DshPet.Win32]::ShowWindow($handle, $SCRIPT:SwHide)
    }
    Update-MenuLabels
    Save-WindowState
}

function Switch-DshWindow {
    Set-DshWindowShown (-not (Get-DshShown))
}

function Show-DshWindow {
    # Asking for something the page carries out means wanting to look at it, so DSH
    # comes back first when it is tucked away or minimized, and is raised when it
    # was merely behind another window - opening the tab is useless otherwise.
    if ($SCRIPT:DshPid -le 0) { return }
    Set-DshWindowShown $true
    $handle = Find-DshWindow
    if ($handle -ne [IntPtr]::Zero) { [void][DshPet.Win32]::SetForegroundWindow($handle) }
}

function Stop-DshWindow {
    # Ending the app is no longer something its window does: the title-bar close now
    # only hides the window while the application keeps running in the tray, so a
    # WM_CLOSE would be read as "tuck DSH away". What ends it is the process that
    # owns every part of it - the Electron main process, which is this process's
    # parent's parent (the Host child runs under it). Ending that process makes the
    # Host notice the closed channel and run its own shutdown (sessions flushed,
    # agents stopped), and that shutdown unloads the plugin, whose cleanup ends this
    # pet with it; the timer's host-liveness check is the fallback if it does not.
    if ($SCRIPT:DshPid -le 0) { return }
    try {
        $dsh = Get-Process -Id $SCRIPT:DshPid -ErrorAction Stop
        $dsh.Kill()
        if (-not $dsh.WaitForExit(3000)) { Write-Log "DSH process $($SCRIPT:DshPid) did not exit within 3s" }
    } catch {
        Write-Log "ending DSH failed: $($_.Exception.Message)"
    }
}

function Save-WindowState {
    # Without a DSH window to control there is nothing to report, and writing a
    # guess would override the host's own view.
    if ($SCRIPT:DshPid -le 0) { return }
    $visible = Get-DshShown
    $foreground = Get-DshForeground
    if ($visible -eq $SCRIPT:WindowVisible -and $foreground -eq $SCRIPT:WindowForeground) { return }
    $SCRIPT:WindowVisible = $visible
    $SCRIPT:WindowForeground = $foreground
    Write-Json $SCRIPT:WindowFile ([ordered]@{ dshVisible = $visible; dshForeground = $foreground })
}

function Invoke-PetClick {
    switch ($SCRIPT:ClickAction) {
        'toggle' { Switch-DshWindow }
        'minimize' {
            if ($SCRIPT:DshPid -le 0) { return }
            $handle = Find-DshWindow
            if ($handle -ne [IntPtr]::Zero) { [void][DshPet.Win32]::ShowWindow($handle, $SCRIPT:SwMinimize) }
        }
        default { }
    }
}

# ---- tray and menu ----------------------------------------------------------
function Exit-Pet {
    if ($SCRIPT:Exiting) { return }
    $SCRIPT:Exiting = $true
    Save-Position
    # The request answers itself: whatever is left of it belongs to no pet, and a
    # marker nobody removes would end the next one the moment it starts.
    try { if (Test-Path -LiteralPath $SCRIPT:QuitFile) { Remove-Item -LiteralPath $SCRIPT:QuitFile -Force } } catch { }
    try { if ($null -ne $SCRIPT:Notify) { $SCRIPT:Notify.Visible = $false; $SCRIPT:Notify.Dispose() } } catch { }
    try { if ($null -ne $SCRIPT:TrayIcon) { $SCRIPT:TrayIcon.Dispose() } } catch { }
    try {
        if ($null -ne $SCRIPT:PetMenu) { $SCRIPT:PetMenu.Dispose() }
        $SCRIPT:PetMenu = $null
    } catch { }
    try { $app.Shutdown() } catch { }
}

function Send-MenuCommand([string]$Command) {
    # The host watches this file the way this pet watches the state file, and the
    # timestamp is what tells a fresh choice from the one it already forwarded.
    Write-Json $SCRIPT:CommandFile ([ordered]@{
        command = $Command
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    })
}

function New-PetMenu {
    # One definition, two ways in: the tray icon and a right-click on the pet.
    # Commands the page carries out come first, window actions after them.
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $chatItem = $menu.Items.Add($SCRIPT:Labels.Chat)
    $chatItem.add_Click({
        try {
            # The page opens the site in its own Browser tab, so DSH has to be on
            # screen first: a tab opened in a hidden window is a tab nobody sees.
            Show-DshWindow
            Send-MenuCommand 'chat'
        } catch { Write-Log $_.Exception.Message }
    })
    # The Git page is the plugin's own tab type, so unlike Chat it needs nothing
    # shipped besides the right Sidebar; the page reads the repository of whatever
    # Session is in front. Showing DSH first is the same requirement.
    $gitItem = $menu.Items.Add($SCRIPT:Labels.Git)
    $gitItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'git'
        } catch { Write-Log $_.Exception.Message }
    })
    # Without a DSH window to control (the web profile) the window entries would be
    # dead, so the menu keeps only the page command and the position. The pet never
    # offers to quit itself: the plugin's own switch owns its lifetime.
    if ($SCRIPT:DshPid -gt 0) {
        $toggleItem = $menu.Items.Add($SCRIPT:Labels.ToggleShown)
        $toggleItem.add_Click({ try { Switch-DshWindow } catch { Write-Log $_.Exception.Message } })
        $SCRIPT:ToggleItems += $toggleItem
    }
    $resetItem = $menu.Items.Add($SCRIPT:Labels.Reset)
    $resetItem.add_Click({ try { Set-DefaultPosition; Save-Position } catch { Write-Log $_.Exception.Message } })
    if ($SCRIPT:DshPid -gt 0) {
        [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        # Restarting is the entry edits to the plugin, and builds, are usually
        # for, so it sits with ending DSH rather than with the window actions.
        $restartItem = $menu.Items.Add($SCRIPT:Labels.RestartDsh)
        $restartItem.add_Click({
            try {
                # Like ending DSH, a restart interrupts whatever is running, so the
                # entry asks first; the message box's own buttons are localized by
                # the system. A restart that cannot be prepared reports itself in
                # its own box, because a menu entry that only wrote to the log
                # reads as one that does nothing.
                $answer = [System.Windows.MessageBox]::Show($SCRIPT:Window, $SCRIPT:Labels.RestartDshConfirm,
                    $SCRIPT:Labels.TrayTip, [System.Windows.MessageBoxButton]::YesNo,
                    [System.Windows.MessageBoxImage]::Question)
                if ($answer -eq [System.Windows.MessageBoxResult]::Yes) { Restart-DshWindow }
            } catch {
                Write-Log $_.Exception.Message
                try { Show-RestartFailure $_.Exception.Message } catch { }
            }
        })
        $quitItem = $menu.Items.Add($SCRIPT:Labels.QuitDsh)
        $quitItem.add_Click({
            try {
                # Closing DSH interrupts whatever is running, so the entry asks first;
                # the message box's own buttons are localized by the system.
                $answer = [System.Windows.MessageBox]::Show($SCRIPT:Window, $SCRIPT:Labels.QuitDshConfirm,
                    $SCRIPT:Labels.TrayTip, [System.Windows.MessageBoxButton]::YesNo,
                    [System.Windows.MessageBoxImage]::Question)
                if ($answer -eq [System.Windows.MessageBoxResult]::Yes) { Stop-DshWindow }
            } catch { Write-Log $_.Exception.Message }
        })
    }
    return $menu
}

function Initialize-Tray {
    # tray.ico is a multi-size icon built by tools/build-assets.py; constructing
    # Icon from a file name avoids the overload ambiguity an HICON handle hits
    # (PowerShell then picks the file-name overload and looks for that file).
    $iconPath = Join-Path $SCRIPT:AssetDir 'tray.ico'
    if (Test-Path -LiteralPath $iconPath) {
        try { $SCRIPT:TrayIcon = New-Object System.Drawing.Icon($iconPath) }
        catch { Write-Log "tray icon failed: $($_.Exception.Message)" }
    }
    $SCRIPT:Notify = New-Object System.Windows.Forms.NotifyIcon
    if ($null -ne $SCRIPT:TrayIcon) { $SCRIPT:Notify.Icon = $SCRIPT:TrayIcon }
    $SCRIPT:Notify.Text = $SCRIPT:Labels.TrayTip
    $SCRIPT:Notify.ContextMenuStrip = New-PetMenu
    if ($SCRIPT:DshPid -gt 0) {
        $SCRIPT:Notify.add_MouseDoubleClick({ try { Switch-DshWindow } catch { Write-Log $_.Exception.Message } })
    }
    $SCRIPT:Notify.Visible = $true
}

# ---- interaction ------------------------------------------------------------
$window.Add_MouseEnter({ try { $SCRIPT:Hovered = $true; Update-PetOpacity } catch { } })
$window.Add_MouseLeave({ try { $SCRIPT:Hovered = $false; Update-PetOpacity } catch { } })
$window.Add_MouseLeftButtonDown({
    try {
        # The press that activates the pet window reaches this handler twice: WPF
        # reports it once while the activation is processed and again as the
        # ordinary mouse message. Only one report of a physical press may act, or
        # a toggle would run twice and put DSH straight back.
        $repeat = $SCRIPT:Pressed
        $SCRIPT:Pressed = $true
        $SCRIPT:PressX = $window.Left
        $SCRIPT:PressY = $window.Top
        $dragged = $false
        try {
            # DragMove blocks until the button is released; a position that did
            # not move is a click rather than a drag.
            $window.DragMove()
            $dragged = [Math]::Abs($window.Left - $SCRIPT:PressX) -ge 2 -or [Math]::Abs($window.Top - $SCRIPT:PressY) -ge 2
        } catch {
            # DragMove could not run: the button was released before it started,
            # or this is the activation report of a press whose own mouse message
            # is still to come. Whether that press is a click or a drag is only
            # known at the release, so the release decides.
            $SCRIPT:PendingClick = $true
        }
        if ($dragged) { Save-Position } elseif (-not $repeat -and -not $SCRIPT:PendingClick) { Invoke-PetClick }
    } catch {
        Write-Log "click failed: $($_.Exception.Message)"
    }
})
$window.Add_MouseRightButtonUp({
    try {
        # The same menu the tray icon shows, at the pointer: a right-click on the
        # pet is the discoverable way in, the tray the durable one.
        if ($null -ne $SCRIPT:PetMenu) { [void]$SCRIPT:PetMenu.Show([System.Windows.Forms.Cursor]::Position) }
    } catch {
        Write-Log "menu failed: $($_.Exception.Message)"
    }
})
$window.Add_MouseLeftButtonUp({
    try {
        $SCRIPT:Pressed = $false
        if (-not $SCRIPT:PendingClick) { return }
        $SCRIPT:PendingClick = $false
        if ([Math]::Abs($window.Left - $SCRIPT:PressX) -ge 2 -or [Math]::Abs($window.Top - $SCRIPT:PressY) -ge 2) { Save-Position }
        else { Invoke-PetClick }
    } catch {
        Write-Log "click failed: $($_.Exception.Message)"
    }
})

# ---- main loop --------------------------------------------------------------
function Test-HostAlive {
    if ($SCRIPT:DshPid -gt 0) {
        $process = Get-Process -Id $SCRIPT:DshPid -ErrorAction SilentlyContinue
        if ($null -eq $process) { return $false }
    }
    try {
        $item = Get-Item -LiteralPath $SCRIPT:StateFile -ErrorAction Stop
        return (((Get-Date) - $item.LastWriteTime).TotalSeconds -lt 45)
    } catch {
        return $false
    }
}

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(200)
$timer.Add_Tick({
    try {
        $SCRIPT:Ticks++

        # The host asks before it goes, so this process can take its own tray icon
        # away first (see $SCRIPT:QuitFile). Nothing is written here: a request the
        # pet answered is not a problem the host has to hear about, and the host
        # already knows it asked.
        if (Test-Path -LiteralPath $SCRIPT:QuitFile) {
            Exit-Pet
            return
        }

        # The host writes on change plus a heartbeat, so a newer timestamp means
        # new content to apply.
        try {
            $item = Get-Item -LiteralPath $SCRIPT:StateFile -ErrorAction Stop
            if ($item.LastWriteTime -ne $SCRIPT:StateStamp) {
                $SCRIPT:StateStamp = $item.LastWriteTime
                Apply-State (Read-Json $SCRIPT:StateFile)
                Update-MenuLabels
            }
        } catch { }

        if ($SCRIPT:FrameCount -gt 1 -and $SCRIPT:Expression -ne '') {
            $now = [Environment]::TickCount
            if (($now - $SCRIPT:LastFrameAt) -ge $SCRIPT:FrameMs) {
                $SCRIPT:LastFrameAt = $now
                $SCRIPT:FrameIndex++
                if ($SCRIPT:FrameIndex -gt $SCRIPT:FrameCount) { $SCRIPT:FrameIndex = 1 }
                Show-CurrentFrame
            }
        }

        # Tell the host whether DSH is on screen: the tucked sleep timer is much
        # shorter than the idle one, and showing DSH again counts as activity.
        # Once a second is plenty; the file is written only when it changes.
        if (($SCRIPT:Ticks % 5) -eq 0) { Save-WindowState }

        # Leave no orphan window: quit when the host or DSH is gone. About every
        # five seconds.
        if (($SCRIPT:Ticks % 25) -eq 0 -and -not (Test-HostAlive)) {
            Write-Log 'host is gone; closing the pet'
            Exit-Pet
        }
    } catch {
        Write-Log "timer failed: $($_.Exception.Message)"
    }
})

try { Initialize-Tray } catch { Write-Log "tray unavailable: $($_.Exception.Message)" }
try { $SCRIPT:PetMenu = New-PetMenu } catch { Write-Log "pet menu unavailable: $($_.Exception.Message)" }

# Apply the state first (it fixes the window size), then place the window and
# clamp it onto a screen.
Apply-State (Read-Json $SCRIPT:StateFile)
Restore-Position
Update-MenuLabels
Save-WindowState

# WPF's ShowInTaskbar=false does not put WS_EX_TOOLWINDOW on the real handle, so
# the pet would still get a taskbar button and an Alt+Tab entry. Set the style on
# the handle before the first Show.
$helper = New-Object System.Windows.Interop.WindowInteropHelper($window)
[void]$helper.EnsureHandle()
$exStyle = [DshPet.Win32]::GetWindowLong($helper.Handle, $SCRIPT:GwlExStyle)
[void][DshPet.Win32]::SetWindowLong($helper.Handle, $SCRIPT:GwlExStyle, $exStyle -bor 0x80)

$window.Show()
$timer.Start()
$app.Run()

# After Run() returns: Exit-Pet already disposed the tray; this is a backstop.
try { if ($null -ne $SCRIPT:Notify) { $SCRIPT:Notify.Dispose() } } catch { }
try { $SCRIPT:Mutex.ReleaseMutex() } catch { }
try { $SCRIPT:Mutex.Dispose() } catch { }
