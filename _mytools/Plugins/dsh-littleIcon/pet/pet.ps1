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
    right-click on the pet opens the menu; an entry the page
    carries out (the chat site, or the plugin's own Git page) brings DSH back on
    screen first and is written to command.json beside the state file for the host
    to relay, and the rest act on this process at once - a screenshot among them:
    the pet owns the desktop the region is dragged over, so the selection is made
    here and the PNG lands in shots/ beside the state file. Updating DSH starts
    this checkout's detached Desktop build, which stops the current app and
    starts the new build only after success. Ending DSH is one of those as well:
    the window's own close only hides it now, so that entry ends the process every
    part of DSH runs under instead (see Stop-DshWindow). Restarting is the same
    ending plus a replacement, which a detached waiter starts once DSH is gone
    because this pet does not outlive it (see Restart-DshWindow).

    The target window is located through DshPid (the host's parent, i.e. the
    Electron main process): Process.MainWindowHandle first, then an enumeration
    of that process's top-level windows that skips IME helper windows. The handle
    is cached, because MainWindowHandle reports 0 once the window is hidden.

    This script is deliberately ASCII-only so Windows PowerShell 5.1 decodes it
    the same way whatever encoding an editor saves: the localized menu labels
    live in labels.json and are read as UTF-8.

.PARAMETER AssetDir
    Animation root: one subdirectory per state holding 1.png ... N.png, plus
    labels.json.

.PARAMETER StateFile
    The JSON state file the host writes.

.PARAMETER PositionFile
    JSON file holding only the window x/y.

.PARAMETER DshPid
    DSH main process id; 0 means no window control (the web profile).

.PARAMETER SelfTest
    Print the loaded labels and the asset inventory, then exit, so a broken script
    fails before the next DSH start.

.PARAMETER ShotProbe
    Capture a fixed corner of the screen for real, print the file it wrote, and
    exit. The selection sheet is not drawn and nobody drags: this is the bitmap,
    the encoder, and the shots directory on their own, so a machine whose screen
    cannot be read fails here instead of at the first menu click.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AssetDir,
    [Parameter(Mandatory = $true)][string]$StateFile,
    [Parameter(Mandatory = $true)][string]$PositionFile,
    [int]$DshPid = 0,
    [switch]$SelfTest,
    [switch]$ShotProbe
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

if (-not ('DshPet.PetMenuRenderer' -as [type])) {
    Add-Type -ReferencedAssemblies 'System.Windows.Forms.dll', 'System.Drawing.dll' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DshPet
{
    public sealed class PetMenuRenderer : ToolStripProfessionalRenderer
    {
        private static readonly Color Canvas = Color.FromArgb(252, 252, 253);
        private static readonly Color Ink = Color.FromArgb(53, 59, 70);
        private static readonly Color Hover = Color.FromArgb(242, 244, 247);
        private static readonly Color Rule = Color.FromArgb(225, 228, 234);

        public PetMenuRenderer() : base(new PetMenuColors())
        {
            RoundedEdges = false;
        }

        public static void ApplyRoundedRegion(ToolStrip strip)
        {
            if (strip.Width <= 0 || strip.Height <= 0) return;
            using (GraphicsPath path = RoundedPath(new Rectangle(0, 0, strip.Width, strip.Height), 14))
            {
                Region previous = strip.Region;
                strip.Region = new Region(path);
                if (previous != null) previous.Dispose();
            }
        }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath path = RoundedPath(new Rectangle(0, 0, e.ToolStrip.Width - 1, e.ToolStrip.Height - 1), 14))
            using (SolidBrush brush = new SolidBrush(Canvas))
            {
                e.Graphics.FillPath(brush, path);
            }
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath path = RoundedPath(new Rectangle(0, 0, e.ToolStrip.Width - 1, e.ToolStrip.Height - 1), 14))
            using (Pen pen = new Pen(Color.FromArgb(217, 221, 228), 1f))
            {
                e.Graphics.DrawPath(pen, path);
            }
        }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle rectangle = new Rectangle(2, 2, e.Item.Width - 4, e.Item.Height - 4);
            using (GraphicsPath path = RoundedPath(rectangle, 8))
            using (SolidBrush brush = new SolidBrush(Hover))
            {
                e.Graphics.FillPath(brush, path);
            }
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using (Pen pen = new Pen(Rule, 1f))
            {
                e.Graphics.DrawLine(pen, 12, y, e.Item.Width - 12, y);
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            Rectangle textBounds = new Rectangle(46, 0, Math.Max(0, e.Item.Width - 58), e.Item.Height);
            TextRenderer.DrawText(e.Graphics, e.Text, e.TextFont, textBounds, Ink,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine |
                TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix | TextFormatFlags.PreserveGraphicsClipping);
            string icon = e.Item.Tag as string;
            if (String.IsNullOrEmpty(icon)) return;

            float scale = 1f;
            int size = 19;
            int left = 14;
            Rectangle bounds = new Rectangle(left, (e.Item.Height - size) / 2, size, size);
            DrawIcon(e.Graphics, icon, bounds, scale);
        }

        private static GraphicsPath RoundedPath(Rectangle rectangle, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int diameter = Math.Min(radius * 2, Math.Min(rectangle.Width, rectangle.Height));
            if (diameter <= 0)
            {
                path.AddRectangle(rectangle);
                return path;
            }
            Rectangle arc = new Rectangle(rectangle.Location, new Size(diameter, diameter));
            path.AddArc(arc, 180, 90);
            arc.X = rectangle.Right - diameter;
            path.AddArc(arc, 270, 90);
            arc.Y = rectangle.Bottom - diameter;
            path.AddArc(arc, 0, 90);
            arc.X = rectangle.Left;
            path.AddArc(arc, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static PointF P(Rectangle bounds, float x, float y)
        {
            return new PointF(bounds.Left + bounds.Width * x / 20f, bounds.Top + bounds.Height * y / 20f);
        }

        private static RectangleF R(Rectangle bounds, float x, float y, float width, float height)
        {
            PointF point = P(bounds, x, y);
            return new RectangleF(point.X, point.Y, bounds.Width * width / 20f, bounds.Height * height / 20f);
        }

        private static void DrawIcon(Graphics graphics, string icon, Rectangle bounds, float scale)
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (Pen pen = new Pen(Ink, Math.Max(1.4f, 1.55f * scale)))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                switch (icon)
                {
                    case "chat":
                        graphics.DrawEllipse(pen, R(bounds, 1.5f, 2f, 17f, 13f));
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 6f, 14f), P(bounds, 4f, 19f), P(bounds, 10f, 15f) });
                        using (SolidBrush dot = new SolidBrush(Ink))
                        {
                            graphics.FillEllipse(dot, R(bounds, 6f, 8f, 1.5f, 1.5f));
                            graphics.FillEllipse(dot, R(bounds, 9.5f, 8f, 1.5f, 1.5f));
                            graphics.FillEllipse(dot, R(bounds, 13f, 8f, 1.5f, 1.5f));
                        }
                        break;
                    case "git":
                        graphics.DrawLine(pen, P(bounds, 5f, 5f), P(bounds, 5f, 15f));
                        graphics.DrawBezier(pen, P(bounds, 5f, 8f), P(bounds, 6f, 8f), P(bounds, 10f, 10f), P(bounds, 15f, 10f));
                        graphics.DrawEllipse(pen, R(bounds, 3f, 1f, 4f, 4f));
                        graphics.DrawEllipse(pen, R(bounds, 3f, 15f, 4f, 4f));
                        graphics.DrawEllipse(pen, R(bounds, 14f, 8f, 4f, 4f));
                        break;
                    case "folder":
                        using (GraphicsPath folder = new GraphicsPath())
                        {
                            folder.AddLines(new PointF[] { P(bounds, 1f, 5f), P(bounds, 7f, 5f), P(bounds, 9f, 7f), P(bounds, 18f, 7f), P(bounds, 18f, 17f), P(bounds, 1f, 17f) });
                            folder.CloseFigure();
                            graphics.DrawPath(pen, folder);
                        }
                        graphics.DrawLine(pen, P(bounds, 1f, 8f), P(bounds, 18f, 8f));
                        break;
                    case "camera":
                        graphics.DrawRectangle(pen, Rectangle.Round(R(bounds, 1.5f, 6f, 17f, 11f)));
                        graphics.DrawEllipse(pen, R(bounds, 7f, 9f, 6f, 6f));
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 6.5f, 6f), P(bounds, 7.5f, 3f), P(bounds, 12.5f, 3f), P(bounds, 13.5f, 6f) });
                        break;
                    case "games":
                        using (GraphicsPath pad = RoundedPath(Rectangle.Round(R(bounds, 1.2f, 6.2f, 17.6f, 9.4f)), 5))
                        {
                            graphics.DrawPath(pen, pad);
                        }
                        graphics.DrawLine(pen, P(bounds, 6.2f, 9.2f), P(bounds, 6.2f, 12.8f));
                        graphics.DrawLine(pen, P(bounds, 4.4f, 11f), P(bounds, 8f, 11f));
                        using (SolidBrush dot = new SolidBrush(Ink))
                        {
                            graphics.FillEllipse(dot, R(bounds, 12.6f, 9.4f, 2.2f, 2.2f));
                            graphics.FillEllipse(dot, R(bounds, 15.2f, 11.8f, 2.2f, 2.2f));
                        }
                        break;
                    case "aquarium":
                        graphics.DrawRectangle(pen, Rectangle.Round(R(bounds, 1.6f, 4.4f, 16.8f, 11.8f)));
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 1.6f, 9.2f), P(bounds, 5.4f, 7.7f), P(bounds, 10f, 9.4f), P(bounds, 14.6f, 7.7f), P(bounds, 18.4f, 9.2f) });
                        using (SolidBrush body = new SolidBrush(Ink))
                        {
                            graphics.FillEllipse(body, R(bounds, 6.2f, 11.6f, 4.4f, 2.8f));
                        }
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 10.6f, 13f), P(bounds, 13.4f, 11.2f), P(bounds, 13.4f, 14.8f), P(bounds, 10.6f, 13f) });
                        break;
                    case "gear":
                        graphics.DrawEllipse(pen, R(bounds, 4.6f, 4.6f, 10.8f, 10.8f));
                        PointF hub = P(bounds, 10f, 10f);
                        float toothInner = bounds.Width * 5.2f / 20f;
                        float toothOuter = bounds.Width * 8.6f / 20f;
                        for (int step = 0; step < 8; step++)
                        {
                            double angle = step * Math.PI / 4;
                            graphics.DrawLine(pen,
                                new PointF(hub.X + (float)(Math.Cos(angle) * toothInner), hub.Y + (float)(Math.Sin(angle) * toothInner)),
                                new PointF(hub.X + (float)(Math.Cos(angle) * toothOuter), hub.Y + (float)(Math.Sin(angle) * toothOuter)));
                        }
                        break;
                    case "globe":
                        graphics.DrawEllipse(pen, R(bounds, 1.6f, 1.6f, 16.8f, 16.8f));
                        graphics.DrawEllipse(pen, R(bounds, 6.4f, 1.6f, 7.2f, 16.8f));
                        graphics.DrawLine(pen, P(bounds, 1.6f, 10f), P(bounds, 18.4f, 10f));
                        break;
                    case "system":
                        graphics.DrawRectangle(pen, Rectangle.Round(R(bounds, 1.6f, 3.6f, 16.8f, 11.6f)));
                        graphics.DrawLine(pen, P(bounds, 10f, 15.2f), P(bounds, 10f, 17.6f));
                        graphics.DrawLine(pen, P(bounds, 6.4f, 17.6f), P(bounds, 13.6f, 17.6f));
                        break;
                    case "restart":
                        graphics.DrawArc(pen, R(bounds, 2f, 2f, 16f, 16f), 36f, 286f);
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 12f, 1.8f), P(bounds, 17.5f, 3.5f), P(bounds, 16f, 8f) });
                        break;
                    case "power":
                        graphics.DrawArc(pen, R(bounds, 2f, 3f, 16f, 16f), 45f, 270f);
                        graphics.DrawLine(pen, P(bounds, 10f, 1f), P(bounds, 10f, 10f));
                        break;
                }
            }
        }

        private sealed class PetMenuColors : ProfessionalColorTable
        {
            public override Color ToolStripDropDownBackground { get { return Canvas; } }
            public override Color MenuBorder { get { return Color.Transparent; } }
            public override Color MenuItemBorder { get { return Color.Transparent; } }
            public override Color MenuItemSelected { get { return Hover; } }
            public override Color ImageMarginGradientBegin { get { return Canvas; } }
            public override Color ImageMarginGradientMiddle { get { return Canvas; } }
            public override Color ImageMarginGradientEnd { get { return Canvas; } }
        }
    }
}
'@
}

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
# A detached build records its result beside this plugin's data directory. The
# pet watches it only while the current app is still alive: an early failure can
# then re-enable the menu and name the log, while a later build stops this process.
$SCRIPT:BuildResultFile = Join-Path ([System.IO.Path]::GetDirectoryName(
    [System.IO.Path]::GetDirectoryName($SCRIPT:StateFile))) 'build\last-build.json'
# The host's request for this pet to quit, written when the plugin is switched off
# or DSH is shutting down. Answering it lets the pet store its position and close
# its window in order; a pet that does not answer is killed as the fallback.
$SCRIPT:QuitFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'quit'
# Where a capture lands when the settings do not say otherwise. Beside the state
# file, in this machine's own harness home: the shots are not part of the
# repository, and the pet is the half holding the screen, so nothing else has to
# agree with the host about them. The settings may name another directory, which
# arrives in the state file and moves this one (see Apply-State).
$SCRIPT:DefaultShotDir = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'shots'
$SCRIPT:ShotDir = $SCRIPT:DefaultShotDir
$SCRIPT:WindowVisible = $null
$SCRIPT:WindowForeground = $null
$SCRIPT:DshPid = $DshPid

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Get-Labels {
    $fallback = [ordered]@{
        PetName               = 'DSH pet'
        Chat                  = 'Chat'
        Git                   = 'Git changes'
        OpenCwd               = 'Open working directory'
        OpenCwdNoCwd          = 'That session has no working directory yet, so there is no folder to open.'
        OpenCwdNoDir          = 'That working directory is gone, so there is no folder to open.'
        OpenCwdFailed         = 'The folder could not be opened.'
        Settings              = 'Settings'
        Sites                 = 'Sites'
        SitesEmpty            = 'No sites yet. Add one under Settings.'
        SitesManage           = 'Manage sites'
        Games                 = 'Mini games'
        Aquarium              = 'Glass aquarium'
        Shot                  = 'Screenshot'
        ShotHint              = 'Drag to choose the area to capture, Esc cancels.'
        ShotSaved             = 'Screenshot copied to the clipboard, and saved as a file'
        ShotSavedNoClipboard  = 'Screenshot saved as a file, but it could not be copied to the clipboard'
        ShotFailed            = 'The screenshot could not be saved.'
        System                = 'System'
        UpdateDsh             = 'Update DSH'
        UpdateDshConfirm      = 'Build this checkout and update DSH? DSH will close during the build and restart only after success. A running task will be interrupted. This does not pull code.'
        UpdateDshUnavailable  = 'The Desktop build script for this checkout could not be found, so DSH was left alone.'
        UpdateDshFailed       = 'The Desktop build could not be started, so DSH was left alone.'
        UpdateDshBuildFailed  = 'The Desktop build failed, so DSH is still using the current build.'
        UpdateDshFailedStep   = 'Failed step: '
        UpdateDshLog          = 'Build log: '
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

# SW_HIDE removes the window from both the screen and the taskbar; the way back is
# the pet itself, or the tray icon DSH's own main process owns; SW_MINIMIZE keeps
# the taskbar entry.
$SCRIPT:SwHide = 0
$SCRIPT:SwMinimize = 6
$SCRIPT:SwRestore = 9
$SCRIPT:SwShow = 5

# Which ShowWindow command brings the DSH window back is decided by the state it is
# in, because the two commands are not interchangeable. SW_RESTORE is the one that
# returns a minimized window, and it is the wrong one for a window that was merely
# hidden: it also returns a maximized or fullscreen window to the size and position
# it had before, so tucking DSH away and bringing it back would drop it out of
# fullscreen. SW_SHOW displays a window at the size and position it already has.
# Measured (Windows PowerShell 5.1, hidden maximized window): SW_RESTORE leaves it
# un-maximized, SW_SHOW leaves it maximized, and neither one un-minimizes.
function Get-ShowCommand([bool]$Minimized) {
    if ($Minimized) { return $SCRIPT:SwRestore }
    return $SCRIPT:SwShow
}

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
# Failures the host already reported before this pet started are history: seeding
# the clock here keeps a stale notice in the state file from opening a box at
# every start.
$SCRIPT:LastNoticeAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$SCRIPT:Ticks = 0
$SCRIPT:PetMenu = $null
$SCRIPT:UpdateMenuItem = $null
# The sites the host last published for the right-click menu's "sites" submenu,
# and that submenu itself: it is rebuilt from this list every time it opens, so an
# edit in the settings card reaches a pet that is already running.
$SCRIPT:Sites = @()
$SCRIPT:SiteMenu = $null
$SCRIPT:BuildStartedAt = 0
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

function Get-DesktopBuildScript([string]$CommandLine) {
    # The development launcher ends its command line with apps/desktop, which is
    # the stable link from a running checkout back to its repository. Require
    # that exact layout so an unrelated quoted directory cannot select a script.
    $desktop = Get-RelaunchDirectory $CommandLine
    if ([string]::IsNullOrWhiteSpace($desktop)) { return $null }
    $desktop = [System.IO.Path]::GetFullPath($desktop)
    $repository = [System.IO.Path]::GetFullPath((Join-Path $desktop '..\..'))
    $expectedDesktop = [System.IO.Path]::GetFullPath((Join-Path $repository 'apps\desktop'))
    if (-not [string]::Equals($desktop, $expectedDesktop, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    $script = Join-Path $repository '_mytools\build\build-desktop.bat'
    if (-not (Test-Path -LiteralPath (Join-Path $repository 'package.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath $script -PathType Leaf)) { return $null }
    return $script
}

function Show-UpdateFailure([string]$Detail) {
    $text = $SCRIPT:Labels.UpdateDshFailed
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { $text = "$text`n`n$Detail" }
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, $text,
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

function Start-DesktopBuild {
    # build-desktop.bat owns the stop/build/restart sequence. Its detached mode
    # returns only after WMI has created the independent build, so a zero exit
    # means it is safe for this pet and DSH to be stopped by that build.
    if ($SCRIPT:DshPid -le 0) { return $false }
    $command = Get-DshLaunchCommand
    if ($null -eq $command) {
        Show-UpdateFailure $SCRIPT:Labels.UpdateDshUnavailable
        return $false
    }
    $script = Get-DesktopBuildScript $command
    if ($null -eq $script) {
        Show-UpdateFailure $SCRIPT:Labels.UpdateDshUnavailable
        return $false
    }
    try {
        $SCRIPT:BuildStartedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $shell = $env:COMSPEC
        if ([string]::IsNullOrWhiteSpace($shell)) { $shell = 'cmd.exe' }
        $start = New-Object System.Diagnostics.ProcessStartInfo
        $start.FileName = $shell
        $start.Arguments = '/d /s /c ""{0}" --detached --restart"' -f $script
        $start.WorkingDirectory = [System.IO.Path]::GetDirectoryName($script)
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $process = [System.Diagnostics.Process]::Start($start)
        if ($null -eq $process) { throw 'The Desktop build launcher did not start.' }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "The Desktop build launcher exited with code $($process.ExitCode)." }
        Write-Log "desktop build started: $script"
        return $true
    } catch {
        $SCRIPT:BuildStartedAt = 0
        Write-Log "starting the Desktop build failed: $($_.Exception.Message)"
        Show-UpdateFailure $_.Exception.Message
        return $false
    }
}

function Check-DesktopBuildResult {
    if ($SCRIPT:BuildStartedAt -le 0) { return }
    $result = Read-Json $SCRIPT:BuildResultFile
    if ($null -eq $result -or $null -eq $result.finishedAt) { return }
    try {
        $finishedAt = [DateTimeOffset]::Parse([string]$result.finishedAt).ToUnixTimeMilliseconds()
    } catch { return }
    if ($finishedAt -lt $SCRIPT:BuildStartedAt) { return }
    $SCRIPT:BuildStartedAt = 0
    if ($null -ne $SCRIPT:UpdateMenuItem) { $SCRIPT:UpdateMenuItem.Enabled = $true }
    if ([bool]$result.ok) { return }
    $detail = "$($SCRIPT:Labels.UpdateDshFailedStep)$($result.step)"
    if (-not [string]::IsNullOrWhiteSpace([string]$result.logPath)) {
        $detail = "$detail`n$($SCRIPT:Labels.UpdateDshLog)$($result.logPath)"
    }
    Write-Log "Desktop build failed: $detail"
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window,
        "$($SCRIPT:Labels.UpdateDshBuildFailed)`n`n$detail",
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

# Report a restart that could not be prepared, in the same box the entry's own
# confirmation uses: the person asked for something, and silence would read as a
# dead menu entry rather than as "DSH was left alone".
function Show-RestartFailure([string]$Detail) {
    $text = $SCRIPT:Labels.RestartDshFailed
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { $text = "$text`n`n$Detail" }
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, $text,
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

# The host reports an "open working directory" that ended without a window the
# same way it reports anything else: in the state file. The person clicked here,
# so the reason is said here - a menu entry that silently opened nothing reads as
# a dead one. The reason is the host's word for it, and the label is this side's.
function Get-OpenFailureText([string]$Reason) {
    switch ($Reason) {
        'no-cwd' { return $SCRIPT:Labels.OpenCwdNoCwd }
        'no-dir' { return $SCRIPT:Labels.OpenCwdNoDir }
        default { return $SCRIPT:Labels.OpenCwdFailed }
    }
}

function Show-OpenFailure([string]$Reason) {
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, (Get-OpenFailureText $Reason),
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
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

# ---- captures (files) -------------------------------------------------------
# A capture is the screen, a bitmap, and a PNG. These are the parts that do not
# need a window: the sheet that is dragged on is built further down, next to the
# menu that opens it.
function Select-ShotDir($State) {
    # The host leaves the field out while the setting is blank, and an empty
    # setting is the default directory rather than a directory named by nothing.
    if ($null -ne $State -and $null -ne $State.shotDir -and -not [string]::IsNullOrWhiteSpace([string]$State.shotDir)) {
        return [string]$State.shotDir
    }
    return $SCRIPT:DefaultShotDir
}

function Get-ShotRectangle($Start, $End) {
    # A drag runs in any direction, so the rectangle comes from the two corners
    # rather than from the points in the order they arrived.
    $left = [Math]::Min($Start.X, $End.X)
    $top = [Math]::Min($Start.Y, $End.Y)
    $right = [Math]::Max($Start.X, $End.X)
    $bottom = [Math]::Max($Start.Y, $End.Y)
    return [System.Drawing.Rectangle]::new($left, $top, ($right - $left), ($bottom - $top))
}

function New-ShotPath {
    if (-not (Test-Path -LiteralPath $SCRIPT:ShotDir)) {
        [void][System.IO.Directory]::CreateDirectory($SCRIPT:ShotDir)
    }
    # Milliseconds in the name: two captures inside the same second are ordinary.
    return (Join-Path $SCRIPT:ShotDir ('shot-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '.png'))
}

function New-ScreenShotBitmap([System.Drawing.Rectangle]$Rectangle) {
    # The caller owns the bitmap, because the same pixels go two ways: saved as a
    # file and put on the clipboard.
    $bitmap = [System.Drawing.Bitmap]::new($Rectangle.Width, $Rectangle.Height)
    $graphics = $null
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($Rectangle.Left, $Rectangle.Top, 0, 0,
            [System.Drawing.Size]::new($Rectangle.Width, $Rectangle.Height))
        return $bitmap
    } catch {
        $bitmap.Dispose()
        throw
    } finally {
        if ($null -ne $graphics) { $graphics.Dispose() }
    }
}

function Save-ShotBitmap($Bitmap, [string]$Path) {
    # PNG rather than JPEG: a capture is read back, not photographed, and the
    # encoder is built in, so the pet needs nothing installed beside it.
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# ---- menu commands and sites ------------------------------------------------
# Defined here rather than with the rest of the menu because the self test below
# builds the sites submenu and fires an entry, so the whole path that click takes
# - the command file it writes, and the list it draws from - has to exist by then.
# Only the window raise in that path is stubbed there: it is defined further down
# and DshPid is 0 in a self test, so it would do nothing anyway.
#
# Write the pet's menu choice where the host reads it. The host watches this file
# the way this pet watches the state file, and the timestamp is what tells a fresh
# choice from the one it already forwarded. The address rides along for the one
# entry that opens a configured site; the host checks it again before the page sees
# it, because this file is a file.
function Send-MenuCommand([string]$Command, [string]$Url = '') {
    $payload = [ordered]@{
        command = $Command
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    if (-not [string]::IsNullOrWhiteSpace($Url)) { $payload.url = $Url }
    Write-Json $SCRIPT:CommandFile $payload
}

# The sites the host published, as the menu draws them. The host has already
# dropped every row it cannot open, so a row reaching here is one to offer; the
# note is what the entry reads, and a row that left it blank is named by its host.
function Get-SiteList($State) {
    $sites = @()
    if ($null -eq $State -or $null -eq $State.sites) { return ,$sites }
    foreach ($site in @($State.sites)) {
        if ($null -eq $site) { continue }
        $url = [string]$site.url
        if ([string]::IsNullOrWhiteSpace($url)) { continue }
        $name = [string]$site.name
        if ([string]::IsNullOrWhiteSpace($name)) { $name = $url }
        $sites += [pscustomobject]@{ Name = $name; Url = $url }
    }
    return ,$sites
}

function Add-SiteMenuItem($Menu, $Site) {
    # One entry per call, and GetNewClosure pins this entry's own site into its
    # handler: a script block reads its variables from the scope in force when it
    # runs, not the one that made it, so a handler that merely referred to $Site -
    # or one shared by a loop - would find nothing at the click and send the
    # command with no address at all.
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = [string]$Site.Name
    # No Tag: these entries carry no icon, and the renderer draws nothing for one
    # it does not know. The address is what the entry opens and the note is what it
    # reads, so the address stays reachable without widening the menu.
    $item.ToolTipText = [string]$Site.Url
    $item.AutoSize = $true
    $item.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    $item.add_Click({
        try {
            # The page opens the site in its own Browser tab, so DSH has to be on
            # screen first: a tab opened in a hidden window is a tab nobody sees.
            Show-DshWindow
            Send-MenuCommand 'site' $Site.Url
        } catch { Write-Log $_.Exception.Message }
    }.GetNewClosure())
    [void]$Menu.DropDownItems.Add($item)
}

function Update-SiteMenu {
    # Rebuilt whole at every open rather than kept in step with the state file:
    # the list is configuration, it is short, and rebuilding is what makes an edit
    # in the settings card reach this menu without restarting either half.
    if ($null -eq $SCRIPT:SiteMenu) { return }
    while ($SCRIPT:SiteMenu.DropDownItems.Count -gt 0) {
        $stale = $SCRIPT:SiteMenu.DropDownItems[0]
        $SCRIPT:SiteMenu.DropDownItems.RemoveAt(0)
        $stale.Dispose()
    }
    $sites = @($SCRIPT:Sites)
    if ($sites.Count -eq 0) {
        $empty = New-Object System.Windows.Forms.ToolStripMenuItem
        $empty.Text = $SCRIPT:Labels.SitesEmpty
        $empty.Enabled = $false
        $empty.AutoSize = $true
        $empty.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
        [void]$SCRIPT:SiteMenu.DropDownItems.Add($empty)
    } else {
        foreach ($site in $sites) { Add-SiteMenuItem $SCRIPT:SiteMenu $site }
    }
    # The way to a list that is empty, and to a longer one: the settings card owns
    # the list, so this is the same page entry the main menu's own Settings opens.
    [void]$SCRIPT:SiteMenu.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    $manage = New-Object System.Windows.Forms.ToolStripMenuItem
    $manage.Text = $SCRIPT:Labels.SitesManage
    $manage.Tag = 'gear'
    $manage.AutoSize = $true
    $manage.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    $manage.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'settings'
        } catch { Write-Log $_.Exception.Message }
    })
    [void]$SCRIPT:SiteMenu.DropDownItems.Add($manage)
}

# ---- self test --------------------------------------------------------------
if ($SelfTest) {
    $states = @(Get-ChildItem -LiteralPath $SCRIPT:AssetDir -Directory | Sort-Object Name | ForEach-Object {
        "$($_.Name)=$(Get-FrameCount $_.Name)"
    })
    Write-Output "labels: $($SCRIPT:Labels.Chat) / $($SCRIPT:Labels.Git) / $($SCRIPT:Labels.OpenCwd) / $($SCRIPT:Labels.Sites) / $($SCRIPT:Labels.SitesManage) / $($SCRIPT:Labels.Games) / $($SCRIPT:Labels.Aquarium) / $($SCRIPT:Labels.Shot) / $($SCRIPT:Labels.Settings) / $($SCRIPT:Labels.System) / $($SCRIPT:Labels.UpdateDsh) / $($SCRIPT:Labels.RestartDsh) / $($SCRIPT:Labels.QuitDsh)"
    Write-Output "assets: $($states -join ', ')"
    Write-Output "state-file: $SCRIPT:StateFile"
    Write-Output "build-result: $SCRIPT:BuildResultFile"
    # Which command brings DSH back decides whether it comes back the way it was:
    # SW_RESTORE also returns a maximized or fullscreen window to the size it had
    # before, so only a minimized window is restored and a hidden one is shown.
    Write-Output "show-commands: minimized=$(Get-ShowCommand $true) hidden=$(Get-ShowCommand $false)"
    # The sites submenu is the menu's only part built from configuration rather than
    # from this script, so it is built here - without ever being shown - and what
    # each list turns into is printed. The host has already dropped every row it
    # cannot open, so what is left to get wrong is the entries themselves: their
    # text, the address each carries, and the ones an empty list still needs.
    # The item is the submenu, so its own DropDownItems is the collection the menu
    # fills; a ContextMenuStrip is a dropdown and has none.
    $SCRIPT:SiteMenu = New-Object System.Windows.Forms.ToolStripMenuItem
    $siteMenuProbe = New-Object System.Collections.Generic.List[string]
    $SCRIPT:Sites = @()
    Update-SiteMenu
    [void]$siteMenuProbe.Add((@($SCRIPT:SiteMenu.DropDownItems) | ForEach-Object { "$($_.GetType().Name)=$($_.Text)" }) -join '|')
    $SCRIPT:Sites = @(
        [pscustomobject]@{ Name = 'Chat'; Url = 'https://chat.deepseek.com/' }
        [pscustomobject]@{ Name = 'Docs'; Url = 'https://docs.example.com/' }
    )
    Update-SiteMenu
    [void]$siteMenuProbe.Add((@($SCRIPT:SiteMenu.DropDownItems) | ForEach-Object { "$($_.Text)@$($_.ToolTipText)" }) -join '|')
    # Firing the first entry is the part that cannot be read off the item: a handler
    # that reads the wrong scope still shows the right text and tooltip and still
    # writes a command, just without the address. DshPid is 0 here, so raising DSH
    # would be a no-op anyway - but it is also defined further down this script,
    # which has not run yet at this point, so it is stubbed for the probe rather
    # than reached. Nothing else about the handler changes.
    function Show-DshWindow { }
    $probeCommand = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'command.json'
    if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
    $SCRIPT:SiteMenu.DropDownItems[0].PerformClick()
    $clicked = Read-Json $probeCommand
    if ($null -eq $clicked) { [void]$siteMenuProbe.Add('click=no-command') }
    else { [void]$siteMenuProbe.Add("click=$($clicked.command)|$($clicked.url)") }
    $SCRIPT:SiteMenu.Dispose()
    $SCRIPT:SiteMenu = $null
    # What the host publishes, read back the way Apply-State reads it: the note names
    # the entry, and a row that left it blank is named by its address instead of
    # reaching the menu as an empty line.
    $published = Get-SiteList ([pscustomobject]@{ sites = @(
        [pscustomobject]@{ name = 'Chat'; url = 'https://chat.deepseek.com/' },
        [pscustomobject]@{ name = ''; url = 'https://bare.test/' }
    ) })
    [void]$siteMenuProbe.Add((@($published) | ForEach-Object { "$($_.Name)=$($_.Url)" }) -join '|')
    Write-Output "site-menu: $($siteMenuProbe -join ' >> ')"
    # Where a capture lands, and what a backwards drag selects: both are built
    # here, and neither needs a screen to be read.
    Write-Output "shot-file: $(New-ShotPath)"
    # Where a capture goes when the settings name a directory, when they name an
    # empty one, and when the host says nothing at all - the last two are the
    # plugin's own directory, which is what the settings field being blank means.
    $shotDirs = @(
        Select-ShotDir ([pscustomobject]@{ shotDir = 'C:\shots' })
        Select-ShotDir ([pscustomobject]@{ shotDir = '' })
        Select-ShotDir $null
    )
    Write-Output "shot-dirs: $($shotDirs -join ' / ')"
    $drag = Get-ShotRectangle ([System.Drawing.Point]::new(30, 40)) ([System.Drawing.Point]::new(10, 20))
    Write-Output "shot-rect: $($drag.X),$($drag.Y) $($drag.Width)x$($drag.Height)"
    # The host's reasons for an open that produced no window, in this side's
    # words: a reason nobody mapped would otherwise reach the person as a box
    # about the wrong thing.
    $reasons = @('no-cwd', 'no-dir', 'unexpected') | ForEach-Object { Get-OpenFailureText $_ }
    Write-Output "open-failure: $($reasons -join ' / ')"
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
    $repository = [System.IO.Path]::GetFullPath((Join-Path $SCRIPT:ScriptDir '..\..\..\..'))
    $desktop = Join-Path $repository 'apps\desktop'
    $buildCommand = '"{0}" "{1}"' -f (Join-Path $env:SystemRoot 'System32\notepad.exe'), $desktop
    Write-Output "build-script: $(Get-DesktopBuildScript $buildCommand)"
    exit 0
}

if ($ShotProbe) {
    # The capture itself, taken for real: no sheet is drawn and nobody drags, so
    # what is left to fail is the screen read, the encoder, and the directory. The
    # clipboard is left alone here: a test must not take what somebody was holding.
    $probeBitmap = New-ScreenShotBitmap ([System.Drawing.Rectangle]::new(0, 0, 320, 200))
    try {
        $probePath = New-ShotPath
        Save-ShotBitmap $probeBitmap $probePath
    } finally {
        $probeBitmap.Dispose()
    }
    Write-Output "shot-probe: $probePath"
    Write-Output "shot-probe-bytes: $((Get-Item -LiteralPath $probePath).Length)"
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
    # Where captures go: the settings may name a directory, and a blank one is the
    # default beside the state file.
    $SCRIPT:ShotDir = Select-ShotDir $State
    # The sites the menu offers; the submenu redraws itself from this list the next
    # time it opens.
    $SCRIPT:Sites = Get-SiteList $State
    # The host asks for a tuck once the user has left DSH untouched long enough;
    # the request says nothing about the current window state, so it only ever
    # hides, and hiding an already hidden window is a no-op.
    if ($null -ne $State.tuck -and [bool]$State.tuck) { Set-DshWindowShown $false }
    # The host's answer to the last "open working directory" that opened nothing.
    # The latest one stays in the file, so only a failure newer than the one this
    # pet has already shown is news.
    if ($null -ne $State.notice -and $null -ne $State.notice.at) {
        $reported = [long]$State.notice.at
        if ($reported -gt $SCRIPT:LastNoticeAt) {
            $SCRIPT:LastNoticeAt = $reported
            Show-OpenFailure ([string]$State.notice.reason)
        }
    }
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
        # A window this pet hid is shown, not restored: it is still maximized or
        # fullscreen underneath, and restoring it would resize it.
        [void][DshPet.Win32]::ShowWindow($handle, (Get-ShowCommand ([DshPet.Win32]::IsIconic($handle))))
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

# ---- capture sheet ----------------------------------------------------------
# The shutter is drawn on the desktop rather than in the pet window: a capture has
# to reach every screen the person can point at, and the pet is one small window in
# a corner. The sheet is a topmost WinForms form, dimmed, whose region has the
# selection cut out, so the hole is a live view of exactly what the file will hold.
# WinForms is also what keeps every coordinate in physical pixels - the units
# Screen and CopyFromScreen use - so a selection never drifts at a display scale
# other than 100%, which is the trap the pet's own WPF position avoids by staying
# in WPF's units.
$SCRIPT:ShotOverlay = $null
$SCRIPT:ShotDragging = $false
$SCRIPT:ShotStart = [System.Drawing.Point]::Empty
$SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty

# A capture that only lands in a file says nothing to the person who made it, so
# the pet says one line where they are already looking - above itself, for a few
# seconds, without taking the focus away from what they were doing.
$SCRIPT:Toast = $null
$SCRIPT:ToastTimer = New-Object System.Windows.Threading.DispatcherTimer
$SCRIPT:ToastTimer.Interval = [TimeSpan]::FromSeconds(3.5)
$SCRIPT:ToastTimer.Add_Tick({
    $SCRIPT:ToastTimer.Stop()
    if ($null -ne $SCRIPT:Toast) {
        $SCRIPT:Toast.Close()
        $SCRIPT:Toast = $null
    }
})

function Set-ShotHole($Form, [System.Drawing.Rectangle]$Selection) {
    # The window's region is the sheet minus the selection: what is left of the
    # window is drawn, and the hole is not part of it at all, so the desktop shows
    # through unmodified.
    $region = [System.Drawing.Region]::new([System.Drawing.Rectangle]::new(0, 0, $Form.ClientSize.Width, $Form.ClientSize.Height))
    if ($Selection.Width -gt 0 -and $Selection.Height -gt 0) { $region.Exclude($Selection) }
    $previous = $Form.Region
    $Form.Region = $region
    if ($null -ne $previous) { $previous.Dispose() }
}

function Close-ShotOverlay {
    $form = $SCRIPT:ShotOverlay
    $SCRIPT:ShotOverlay = $null
    $SCRIPT:ShotDragging = $false
    if ($null -eq $form) { return }
    try {
        $region = $form.Region
        $form.Region = $null
        if ($null -ne $region) { $region.Dispose() }
    } catch { }
    try { $form.Hide() } catch { }
    try { $form.Close() } catch { }
}

function Copy-ShotImage($Bitmap) {
    # The clipboard carries the picture and nothing else: a target that takes an
    # image - another chat window, a document, or DSH's own paste intake - receives
    # the picture, and one that takes only text receives nothing rather than a path
    # it would have to go and open. Where the file landed is what the notice above
    # the pet says.
    # Two image formats rather than one, because they are read by different halves
    # of Windows: CF_BITMAP is what an ordinary application asks for (Paint, Word, a
    # chat client), and CF_DIB is the one a browser reads - Chromium, which draws
    # DSH's own window, looks for a DIB and ignores a bare bitmap handle.
    # Whatever else is running can hold the clipboard open for a moment, and the
    # capture is already on disk: a refusal costs one retry, and only the last one
    # costs the copy.
    $dib = $null
    $lastError = ''
    try {
        # The BMP encoder's output without its 14-byte file header is exactly a DIB.
        $stream = New-Object System.IO.MemoryStream
        $bytes = $null
        try {
            $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Bmp)
            $bytes = $stream.ToArray()
        } finally {
            $stream.Dispose()
        }
        $dib = [System.IO.MemoryStream]::new($bytes, 14, $bytes.Length - 14)
        $data = New-Object System.Windows.Forms.DataObject
        $data.SetImage($Bitmap)
        $data.SetData([System.Windows.Forms.DataFormats]::Dib, $false, $dib)
        for ($attempt = 0; $attempt -lt 5; $attempt++) {
            try {
                # copy: true renders both formats onto the clipboard through OLE, so
                # the picture does not depend on handles this process is about to
                # destroy.
                [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
                return $true
            } catch {
                $lastError = $_.Exception.Message
                Start-Sleep -Milliseconds 80
            }
        }
    } finally {
        if ($null -ne $dib) { $dib.Dispose() }
    }
    Write-Log "copying the screenshot to the clipboard failed: $lastError"
    return $false
}

function Show-ShotFailure([string]$Detail) {
    # The person asked for a capture, and a capture that silently wrote nothing
    # reads as a dead menu entry; the reason is the only thing that makes it
    # fixable. Same box the restart entry uses for the same reason.
    $text = $SCRIPT:Labels.ShotFailed
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { $text = "$text`n`n$Detail" }
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, $text,
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

function Show-PetNotice([string]$Title, [string]$Detail) {
    try {
        if ($null -ne $SCRIPT:Toast) {
            $SCRIPT:Toast.Close()
            $SCRIPT:Toast = $null
        }
        $toast = New-Object System.Windows.Window
        $toast.WindowStyle = [System.Windows.WindowStyle]::None
        $toast.AllowsTransparency = $true
        $toast.Background = [System.Windows.Media.Brushes]::Transparent
        $toast.ShowInTaskbar = $false
        $toast.Topmost = $true
        $toast.ShowActivated = $false
        $toast.ResizeMode = [System.Windows.ResizeMode]::NoResize
        $toast.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
        $toast.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual

        $panel = New-Object System.Windows.Controls.StackPanel
        $panel.Margin = New-Object System.Windows.Thickness(16, 11, 16, 12)
        $headline = New-Object System.Windows.Controls.TextBlock
        $headline.Text = $Title
        $headline.FontSize = 13
        $headline.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(255, 240, 244, 250))
        $path = New-Object System.Windows.Controls.TextBlock
        $path.Text = $Detail
        $path.FontSize = 11.5
        $path.MaxWidth = 460
        $path.TextWrapping = [System.Windows.TextWrapping]::Wrap
        $path.Margin = New-Object System.Windows.Thickness(0, 4, 0, 0)
        $path.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(255, 176, 186, 200))
        [void]$panel.Children.Add($headline)
        [void]$panel.Children.Add($path)

        $border = New-Object System.Windows.Controls.Border
        $border.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(242, 38, 43, 52))
        $border.CornerRadius = New-Object System.Windows.CornerRadius(10)
        $border.Child = $panel
        $shadow = New-Object System.Windows.Media.Effects.DropShadowEffect
        $shadow.BlurRadius = 18
        $shadow.Opacity = 0.35
        $shadow.ShadowDepth = 3
        $border.Effect = $shadow
        $toast.Content = $border

        $toast.Show()
        # Placed after Show() because SizeToContent gives no size before it: above
        # the pet where the screen has room there, below it otherwise.
        $toast.UpdateLayout()
        $area = [System.Windows.SystemParameters]::WorkArea
        $left = $window.Left + (($window.Width - $toast.ActualWidth) / 2)
        $top = $window.Top - $toast.ActualHeight - 10
        if ($top -lt ($area.Top + 8)) { $top = $window.Top + $window.Height + 10 }
        $toast.Left = [Math]::Min([Math]::Max($left, $area.Left + 8), [Math]::Max($area.Left + 8, $area.Right - $toast.ActualWidth - 8))
        $toast.Top = [Math]::Min([Math]::Max($top, $area.Top + 8), [Math]::Max($area.Top + 8, $area.Bottom - $toast.ActualHeight - 8))
        $SCRIPT:Toast = $toast
        $SCRIPT:ToastTimer.Stop()
        $SCRIPT:ToastTimer.Start()
    } catch {
        Write-Log "showing the pet notice failed: $($_.Exception.Message)"
    }
}

function Complete-RegionShot($Form, [System.Drawing.Rectangle]$Selection) {
    # This process's own sheet has to be off the screen before the shutter, or the
    # dimming would be in the file. The hole already showed the desktop, so what
    # the person saw inside the selection is what lands in the PNG.
    $shot = [System.Drawing.Rectangle]::new(($Form.Left + $Selection.X), ($Form.Top + $Selection.Y),
        $Selection.Width, $Selection.Height)
    $Form.Hide()
    [System.Windows.Forms.Application]::DoEvents()
    # The hidden window is gone once the system has composed a frame without it;
    # a sleeping dispatcher needs no repaint, so this is the wait that costs.
    Start-Sleep -Milliseconds 90
    $bitmap = New-ScreenShotBitmap $shot
    try {
        $path = New-ShotPath
        Save-ShotBitmap $bitmap $path
        $copied = Copy-ShotImage $bitmap
    } finally {
        $bitmap.Dispose()
    }
    Close-ShotOverlay
    if ($copied) { Show-PetNotice $SCRIPT:Labels.ShotSaved $path }
    else { Show-PetNotice $SCRIPT:Labels.ShotSavedNoClipboard $path }
}

function Start-RegionShot {
    if ($null -ne $SCRIPT:ShotOverlay) { return }
    $form = New-Object System.Windows.Forms.Form
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    # The virtual screen, so a second monitor is captured like the first.
    $form.Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $form.BackColor = [System.Drawing.Color]::Black
    $form.Opacity = 0.35
    $form.TopMost = $true
    $form.ShowInTaskbar = $false
    # Escape has to reach this form: it is the way out for a capture opened by
    # mistake, next to a right-click.
    $form.KeyPreview = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Cross

    $SCRIPT:ShotOverlay = $form
    $SCRIPT:ShotDragging = $false
    $SCRIPT:ShotStart = [System.Drawing.Point]::Empty
    $SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty
    Set-ShotHole $form $SCRIPT:ShotSelection

    $form.add_Paint({
        param($sender, $eventArgs)
        try {
            $graphics = $eventArgs.Graphics
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $font = $null
            $brush = $null
            $pen = $null
            try {
                $font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
                $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 244, 247))
                $primary = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $hint = $graphics.MeasureString($SCRIPT:Labels.ShotHint, $font)
                $graphics.DrawString($SCRIPT:Labels.ShotHint, $font, $brush,
                    (($primary.Left - $sender.Left) + (($primary.Width - $hint.Width) / 2)),
                    (($primary.Top - $sender.Top) + 42))
                $selection = $SCRIPT:ShotSelection
                if ($selection.Width -gt 0 -and $selection.Height -gt 0) {
                    # The hole is the selection, so the frame is drawn just outside
                    # it: a stroke centred on that edge would be clipped in half.
                    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 122, 180, 255), 2)
                    $graphics.DrawRectangle($pen, ($selection.X - 2), ($selection.Y - 2),
                        ($selection.Width + 3), ($selection.Height + 3))
                    $graphics.DrawString(('{0} x {1}' -f $selection.Width, $selection.Height), $font, $brush,
                        $selection.X, [Math]::Max(4, ($selection.Y - 26)))
                }
            } finally {
                if ($null -ne $pen) { $pen.Dispose() }
                if ($null -ne $brush) { $brush.Dispose() }
                if ($null -ne $font) { $font.Dispose() }
            }
        } catch {
            Write-Log "drawing the capture sheet failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseDown({
        param($sender, $eventArgs)
        try {
            if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
                Close-ShotOverlay
                return
            }
            $SCRIPT:ShotStart = $eventArgs.Location
            $SCRIPT:ShotDragging = $true
            $SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty
            Set-ShotHole $sender $SCRIPT:ShotSelection
            # Held, so the drag keeps arriving once the pointer is over the hole.
            $sender.Capture = $true
            $sender.Invalidate()
        } catch {
            Write-Log "starting the selection failed: $($_.Exception.Message)"
            Close-ShotOverlay
        }
    })
    $form.add_MouseMove({
        param($sender, $eventArgs)
        if (-not $SCRIPT:ShotDragging) { return }
        try {
            $SCRIPT:ShotSelection = Get-ShotRectangle $SCRIPT:ShotStart $eventArgs.Location
            Set-ShotHole $sender $SCRIPT:ShotSelection
            $sender.Invalidate()
        } catch {
            Write-Log "drawing the selection failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseUp({
        param($sender, $eventArgs)
        try {
            if (-not $SCRIPT:ShotDragging) { return }
            $SCRIPT:ShotDragging = $false
            $sender.Capture = $false
            if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
            $selection = Get-ShotRectangle $SCRIPT:ShotStart $eventArgs.Location
            # A click that never dragged is not a selection: it leaves no file and
            # says nothing, exactly like Escape.
            if ($selection.Width -lt 4 -or $selection.Height -lt 4) {
                Close-ShotOverlay
                return
            }
            Complete-RegionShot $sender $selection
        } catch {
            Write-Log "saving the capture failed: $($_.Exception.Message)"
            Close-ShotOverlay
            try { Show-ShotFailure $_.Exception.Message } catch { }
        }
    })
    $form.add_KeyDown({
        param($sender, $eventArgs)
        if ($eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
            $eventArgs.Handled = $true
            Close-ShotOverlay
        }
    })

    $form.Show()
    $form.Activate()
    # Escape is only heard by the window that has the focus, so the sheet asks for
    # it twice: Activate() moves within this process, and SetForegroundWindow asks
    # the system. The click that chose the menu entry is what makes the second one
    # allowed, and a refusal costs nothing.
    [void][DshPet.Win32]::SetForegroundWindow($form.Handle)
}

# ---- menu -------------------------------------------------------------------
function Exit-Pet {
    if ($SCRIPT:Exiting) { return }
    $SCRIPT:Exiting = $true
    Save-Position
    # The request answers itself: whatever is left of it belongs to no pet, and a
    # marker nobody removes would end the next one the moment it starts.
    try { if (Test-Path -LiteralPath $SCRIPT:QuitFile) { Remove-Item -LiteralPath $SCRIPT:QuitFile -Force } } catch { }
    try {
        if ($null -ne $SCRIPT:PetMenu) { $SCRIPT:PetMenu.Dispose() }
        $SCRIPT:PetMenu = $null
    } catch { }
    try { $app.Shutdown() } catch { }
}

function Add-PetMenuItem($Items, [string]$Text, [string]$Icon) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $Text
    $item.Tag = $Icon
    $item.AutoSize = $true
    $item.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 0)
    $item.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    [void]$Items.Add($item)
    return $item
}

function New-PetMenu {
    # The plugin's only menu surface: a right-click on the pet. Commands the page
    # carries out come first, window actions after them.
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $menu.AutoSize = $true
    $menu.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $menu.ForeColor = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $menu.Padding = New-Object System.Windows.Forms.Padding(6, 6, 6, 6)
    $menu.Margin = New-Object System.Windows.Forms.Padding(0)
    $menu.MinimumSize = New-Object System.Drawing.Size(220, 0)
    $menu.ShowImageMargin = $false
    $menu.ShowCheckMargin = $false
    $menu.DropShadowEnabled = $true
    $menu.Renderer = New-Object DshPet.PetMenuRenderer
    try {
        $menu.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10.5, [System.Drawing.FontStyle]::Regular,
            [System.Drawing.GraphicsUnit]::Point)
    } catch { }
    $menu.add_Opened({
        param($sender, $eventArgs)
        try { [DshPet.PetMenuRenderer]::ApplyRoundedRegion($sender) } catch { Write-Log $_.Exception.Message }
    })
    $chatItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Chat 'chat'
    $chatItem.add_Click({
        try {
            # The page opens the site in its own Browser tab, so DSH has to be on
            # screen first: a tab opened in a hidden window is a tab nobody sees.
            Show-DshWindow
            Send-MenuCommand 'chat'
        } catch { Write-Log $_.Exception.Message }
    })
    # The sites the settings card owns, one level down: the list is the person's
    # own and can be any length, so the entry itself opens nothing and the submenu
    # is rebuilt from the published list at every open (see Update-SiteMenu), which
    # is also what makes an edit reach a pet that is already running.
    $sitesItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Sites 'globe'
    $sitesItem.DropDown.ShowImageMargin = $false
    $sitesItem.DropDown.ShowItemToolTips = $true
    $sitesItem.DropDown.BackColor = $menu.BackColor
    $sitesItem.DropDown.ForeColor = $menu.ForeColor
    $sitesItem.add_DropDownOpening({
        try { Update-SiteMenu } catch { Write-Log $_.Exception.Message }
    })
    $SCRIPT:SiteMenu = $sitesItem
    # The Git page is the plugin's own tab type, so unlike Chat it needs nothing
    # shipped besides the right Sidebar; the page reads the repository of whatever
    # Session is in front. Showing DSH first is the same requirement.
    $gitItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Git 'git'
    $gitItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'git'
        } catch { Write-Log $_.Exception.Message }
    })
    # Opening the working directory is the page's move as well, for the opposite
    # reason: the pet knows no Session's directory, and the page can name one but
    # cannot open it. Nothing is raised first here - the folder window is what the
    # person asked to see, and Explorer brings itself to the front.
    $openItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.OpenCwd 'folder'
    $openItem.add_Click({
        try { Send-MenuCommand 'open-cwd' } catch { Write-Log $_.Exception.Message }
    })
    # The mini games live one level down: the entry itself opens nothing, so
    # more of them can join without touching this menu's shape again. Its first
    # child is the glass aquarium, which the page owns like the entries above,
    # and therefore raises DSH for the same reason: a fullscreen overlay in a
    # hidden window is an overlay nobody sees.
    $gamesItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Games 'games'
    $gamesItem.DropDown.ShowImageMargin = $false
    $gamesItem.DropDown.BackColor = $menu.BackColor
    $gamesItem.DropDown.ForeColor = $menu.ForeColor
    $aquariumItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $aquariumItem.Text = $SCRIPT:Labels.Aquarium
    $aquariumItem.Tag = 'aquarium'
    $aquariumItem.AutoSize = $true
    $aquariumItem.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    $aquariumItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'aquarium'
        } catch { Write-Log $_.Exception.Message }
    })
    [void]$gamesItem.DropDownItems.Add($aquariumItem)
    # A capture belongs to this process rather than to the page: the pet is the half
    # that can draw over the whole desktop, and the file needs nothing of DSH. It
    # therefore raises no window either - the sheet covers whatever is there.
    $shotItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Shot 'camera'
    $shotItem.add_Click({
        try { Start-RegionShot } catch {
            Write-Log "starting a capture failed: $($_.Exception.Message)"
            try { Show-ShotFailure $_.Exception.Message } catch { }
        }
    })
    # Settings ends the list on both profiles: it opens a page of DSH's own rather
    # than a window this process controls, so the web profile keeps it too. The pet
    # never offers to quit itself: the plugin's own switch owns its lifetime.
    $settingsItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Settings 'gear'
    $settingsItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'settings'
        } catch { Write-Log $_.Exception.Message }
    })
    # Building, ending, or restarting the app requires its Desktop process, so
    # the divider and the submenu under it exist on Desktop only. The three share
    # one parent because each of them acts on the running application rather than
    # opening something inside it.
    if ($SCRIPT:DshPid -gt 0) {
        [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        $systemItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.System 'system'
        $systemItem.DropDown.ShowImageMargin = $false
        $systemItem.DropDown.BackColor = $menu.BackColor
        $systemItem.DropDown.ForeColor = $menu.ForeColor
        $updateItem = Add-PetMenuItem $systemItem.DropDownItems $SCRIPT:Labels.UpdateDsh 'restart'
        $SCRIPT:UpdateMenuItem = $updateItem
        $updateItem.add_Click({
            param($sender, $eventArgs)
            try {
                $answer = [System.Windows.MessageBox]::Show($SCRIPT:Window, $SCRIPT:Labels.UpdateDshConfirm,
                    $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::YesNo,
                    [System.Windows.MessageBoxImage]::Question)
                if ($answer -eq [System.Windows.MessageBoxResult]::Yes) {
                    $sender.Enabled = $false
                    if (-not (Start-DesktopBuild)) { $sender.Enabled = $true }
                }
            } catch {
                Write-Log $_.Exception.Message
                try { Show-UpdateFailure $_.Exception.Message } catch { }
            }
        })
        # Restarting is what edits to the plugin, and builds, are usually for, so
        # it sits above ending DSH rather than first in the submenu.
        $restartItem = Add-PetMenuItem $systemItem.DropDownItems $SCRIPT:Labels.RestartDsh 'restart'
        $restartItem.add_Click({
            try {
                # Like ending DSH, a restart interrupts whatever is running, so the
                # entry asks first; the message box's own buttons are localized by
                # the system. A restart that cannot be prepared reports itself in
                # its own box, because a menu entry that only wrote to the log
                # reads as one that does nothing.
                $answer = [System.Windows.MessageBox]::Show($SCRIPT:Window, $SCRIPT:Labels.RestartDshConfirm,
                    $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::YesNo,
                    [System.Windows.MessageBoxImage]::Question)
                if ($answer -eq [System.Windows.MessageBoxResult]::Yes) { Restart-DshWindow }
            } catch {
                Write-Log $_.Exception.Message
                try { Show-RestartFailure $_.Exception.Message } catch { }
            }
        })
        $quitItem = Add-PetMenuItem $systemItem.DropDownItems $SCRIPT:Labels.QuitDsh 'power'
        $quitItem.add_Click({
            try {
                # Closing DSH interrupts whatever is running, so the entry asks first;
                # the message box's own buttons are localized by the system.
                $answer = [System.Windows.MessageBox]::Show($SCRIPT:Window, $SCRIPT:Labels.QuitDshConfirm,
                    $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::YesNo,
                    [System.Windows.MessageBoxImage]::Question)
                if ($answer -eq [System.Windows.MessageBoxResult]::Yes) { Stop-DshWindow }
            } catch { Write-Log $_.Exception.Message }
        })
    }
    return $menu
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
        # The menu the pet offers: a right-click is the only way in.
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
        Check-DesktopBuildResult

        # The host asks before it goes, so this process can store its position and
        # close in order (see $SCRIPT:QuitFile). Nothing is written here: a request
        # the pet answered is not a problem the host has to hear about, and the host
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

try { $SCRIPT:PetMenu = New-PetMenu } catch { Write-Log "pet menu unavailable: $($_.Exception.Message)" }



# Apply the state first (it fixes the window size), then place the window and
# clamp it onto a screen.
Apply-State (Read-Json $SCRIPT:StateFile)
Restore-Position
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

# After Run() returns: Exit-Pet already disposed the menu; this is a backstop.
try { if ($null -ne $SCRIPT:PetMenu) { $SCRIPT:PetMenu.Dispose() } } catch { }
try { $SCRIPT:Mutex.ReleaseMutex() } catch { }
try { $SCRIPT:Mutex.Dispose() } catch { }
