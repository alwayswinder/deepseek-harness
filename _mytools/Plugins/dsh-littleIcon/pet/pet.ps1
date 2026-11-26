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
    here and the PNG lands in shots/ beside the state file. Screen recording is the
    same kind of work one step further: the same sheet chooses an area, ffmpeg grabs
    it and writes an MP4 into recordings/, and a small always-on-top bar outside the
    area is what stops it (see Start-ScreenRecord). Quick access is one of
    those: a panel of nine folder tiles, the Session's directory from the state
    file in the middle and Explorer's own recent folders around it, where a click
    raises the window that already shows the folder instead of opening a second
    one (see Start-QuickAccess). Updating DSH starts
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

    Music plays here rather than in the DSH window: a page's audio element belongs
    to a window that can be tucked away, while this process stays on the desktop,
    so the right-click menu's "music" submenu plays, pauses, and steps through the
    tracks the host published in music.json (the tracks it has files for, the
    volume, a download running, and whatever the settings card asked for). The
    audio itself is a WPF MediaPlayer over the local file, which is why the host
    downloads AAC streams and nothing here decodes anything by itself. This
    process reports what it is playing back into music-player.json, which is what
    the settings card and the next start resume from.

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

.PARAMETER MusicProbe
    Open one audio file through the media player the music uses, print what it
    found, and exit. No window, no menu, and no library are involved: this is the
    decoder, the sound device, and a file the host downloaded on their own, so a
    machine that cannot play what was downloaded fails here instead of at the
    first menu click.

.PARAMETER AudioProbe
    Print what Windows reports about the audio sessions on the default output
    device - each one's process, state, and peak level - and exit. This is what
    the probe that steps aside for another player reads, printed rather than acted
    on, so a machine can be checked for what it sees before anything is decided
    from it.

.PARAMETER MenuProbe
    Lay the real right-click menu out off screen, print each row's width and the
    card's, draw it to this path, and exit. Row geometry is what decides whether a
    submenu chevron lands on the card's edge or on top of a label, and that cannot
    be read off the script.

.PARAMETER ShotPreviewProbe
    Build the capture preview over a synthetic bitmap, lay it out off screen, draw
    it to this path, build the window that layout belongs to without showing it,
    print the three buttons it holds, and exit. The preview stands between a capture
    and the file, so its layout and its labels are what a person reads before
    anything is written; nothing here needs a screen.

.PARAMETER RecordProbe
    Record a fixed 320x200 corner of the screen for two seconds through ffmpeg,
    stop it the way the menu does, print the file and its size, and exit. No sheet,
    no bar, and no notice are involved: this is gdigrab, x264, the stop request, and
    the recordings directory on their own. A machine without ffmpeg prints
    `record-probe: skipped no-ffmpeg` and succeeds, because the recorder is an
    optional download the video clip window owns.

.PARAMETER RecordBarProbe
    Lay the recording bar out, paint it off screen with a running clock, write the
    picture to this path, build the borderless window behind that layout without
    showing it, print both sizes and the stop button's box, and exit. A bar whose
    rows were measured too narrow clips its stop label, and that cannot be read off
    the script; nothing here needs a screen or a recording.

.PARAMETER RecordPreviewProbe
    Paint the recording preview off screen over a drawn stand-in poster, write the
    picture to this path, build the borderless window behind that layout without
    showing it, print the layout size, the window's size, and the three buttons, and
    exit. The preview is what stands between a finished recording and its file, so
    its layout and labels are worth checking without a recording to finish.

.PARAMETER RecordPlayProbe
    Open the real preview window on the media file at this path, hold it on screen
    long enough for the first frame, write the window to this path plus `.png`, and
    print what the player and the transport did: the video's natural size, the
    poster position, the picture's average luminance, and the playhead drift across a
    pause. A preview that opens black and a pause that does not hold cannot be read
    off the script, and this is what shows both.

.PARAMETER RecordSheetProbe
    Drive the recording selection sheet the way a person does - press, drag, release,
    then Escape - and write a picture of the sheet at each step into this directory.
    It reports whether the dragged selection was on screen while it was being
    dragged, the frame the release left, whether the start window appeared, and
    whether Escape closed the sheet. Showing a live topmost window is the only way
    to measure any of that.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AssetDir,
    [Parameter(Mandatory = $true)][string]$StateFile,
    [Parameter(Mandatory = $true)][string]$PositionFile,
    [int]$DshPid = 0,
    [switch]$SelfTest,
    [switch]$ShotProbe,
    [switch]$AudioProbe,
    [string]$MusicProbe = '',
    [string]$MenuProbe = '',
    [string]$ShotPreviewProbe = '',
    [string]$RecordProbe = '',
    [string]$RecordBarProbe = '',
    [string]$RecordPreviewProbe = '',
    [string]$RecordPlayProbe = '',
    [string]$RecordSheetProbe = ''
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
            // A row with a submenu keeps room on its right for the chevron drawn by
            // OnRenderArrow; a row without one only needs the usual margin.
            bool hasDropDown = e.Item is ToolStripMenuItem && ((ToolStripMenuItem)e.Item).HasDropDownItems;
            int rightReserve = hasDropDown ? 34 : 12;
            Rectangle textBounds = new Rectangle(46, 0, Math.Max(0, e.Item.Width - 46 - rightReserve), e.Item.Height);
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

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            // Rows are as wide as the card, not as wide as their labels, so the stock
            // glyph - which is placed against the label - would either float in the
            // middle of a short row or sit under a long one. The chevron is drawn on
            // the row's own right edge instead, the same edge for every row.
            if (!(e.Item is ToolStripMenuItem))
            {
                base.OnRenderArrow(e);
                return;
            }
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            float x = e.Item.Width - 22f;
            float y = e.Item.Height / 2f;
            using (Pen pen = new Pen(Ink, 1.7f))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                e.Graphics.DrawLines(pen, new PointF[]
                {
                    new PointF(x - 3f, y - 4.5f),
                    new PointF(x + 1.5f, y),
                    new PointF(x - 3f, y + 4.5f)
                });
            }
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
                    case "video":
                        using (GraphicsPath screen = RoundedPath(Rectangle.Round(R(bounds, 1.2f, 4.4f, 17.6f, 11.4f)), 3))
                        {
                            graphics.DrawPath(pen, screen);
                        }
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 8.4f, 7.6f), P(bounds, 13.6f, 10.1f), P(bounds, 8.4f, 12.6f), P(bounds, 8.4f, 7.6f) });
                        graphics.DrawLine(pen, P(bounds, 6f, 17.4f), P(bounds, 14f, 17.4f));
                        break;
                    case "record":
                        graphics.DrawEllipse(pen, R(bounds, 3f, 3f, 14f, 14f));
                        using (SolidBrush dot = new SolidBrush(Ink))
                        {
                            graphics.FillEllipse(dot, R(bounds, 7f, 7f, 6f, 6f));
                        }
                        break;
                    case "stop":
                        using (GraphicsPath square = RoundedPath(Rectangle.Round(R(bounds, 4f, 4f, 12f, 12f)), 2))
                        {
                            graphics.DrawPath(pen, square);
                        }
                        using (SolidBrush block = new SolidBrush(Ink))
                        {
                            graphics.FillRectangle(block, Rectangle.Round(R(bounds, 7.4f, 7.4f, 5.2f, 5.2f)));
                        }
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
                    case "fish-tank":
                        using (GraphicsPath body = RoundedPath(Rectangle.Round(R(bounds, 2.6f, 6.4f, 11.2f, 7.6f)), 3))
                        {
                            graphics.DrawPath(pen, body);
                        }
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 13.8f, 8f), P(bounds, 17.4f, 6.2f), P(bounds, 17.4f, 14.2f), P(bounds, 13.8f, 12.4f) });
                        using (SolidBrush eye = new SolidBrush(Ink))
                        {
                            graphics.FillEllipse(eye, R(bounds, 4.8f, 9f, 1.8f, 1.8f));
                        }
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
                    case "sparkles":
                        using (GraphicsPath star = new GraphicsPath())
                        {
                            star.AddLines(new PointF[] {
                                P(bounds, 7.4f, 2.4f), P(bounds, 8.9f, 8.2f), P(bounds, 14.8f, 9.8f),
                                P(bounds, 8.9f, 11.4f), P(bounds, 7.4f, 17.2f), P(bounds, 5.9f, 11.4f),
                                P(bounds, 0.2f, 9.8f), P(bounds, 5.9f, 8.2f)
                            });
                            star.CloseFigure();
                            graphics.DrawPath(pen, star);
                        }
                        using (GraphicsPath spark = new GraphicsPath())
                        {
                            spark.AddLines(new PointF[] {
                                P(bounds, 15.8f, 11.8f), P(bounds, 16.5f, 14.2f), P(bounds, 18.9f, 14.9f),
                                P(bounds, 16.5f, 15.6f), P(bounds, 15.8f, 18f), P(bounds, 15.1f, 15.6f),
                                P(bounds, 12.7f, 14.9f), P(bounds, 15.1f, 14.2f)
                            });
                            spark.CloseFigure();
                            graphics.DrawPath(pen, spark);
                        }
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
                    case "music":
                        graphics.DrawEllipse(pen, R(bounds, 2f, 12.4f, 5.2f, 4.4f));
                        graphics.DrawLine(pen, P(bounds, 7.2f, 14.6f), P(bounds, 7.2f, 3.8f));
                        graphics.DrawBezier(pen, P(bounds, 7.2f, 3.8f), P(bounds, 11.4f, 4.6f), P(bounds, 14.6f, 6.4f), P(bounds, 15.4f, 9.6f));
                        graphics.DrawLine(pen, P(bounds, 15.4f, 9.6f), P(bounds, 15.4f, 13.6f));
                        graphics.DrawEllipse(pen, R(bounds, 10.2f, 13.6f, 5.2f, 4.4f));
                        break;
                    case "stage":
                        graphics.DrawRectangle(pen, Rectangle.Round(R(bounds, 1.4f, 2.2f, 17.2f, 12.4f)));
                        graphics.DrawLine(pen, P(bounds, 10f, 14.6f), P(bounds, 10f, 17.4f));
                        graphics.DrawLine(pen, P(bounds, 6.4f, 17.4f), P(bounds, 13.6f, 17.4f));
                        graphics.DrawLine(pen, P(bounds, 6.2f, 6.2f), P(bounds, 6.2f, 10.8f));
                        graphics.DrawLine(pen, P(bounds, 10f, 4.6f), P(bounds, 10f, 12.4f));
                        graphics.DrawLine(pen, P(bounds, 13.8f, 6.8f), P(bounds, 13.8f, 10.2f));
                        break;
                    case "image":
                        graphics.DrawRectangle(pen, Rectangle.Round(R(bounds, 1.6f, 3.2f, 16.8f, 13.6f)));
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 3f, 15f), P(bounds, 7.6f, 10.2f), P(bounds, 11.2f, 13.6f), P(bounds, 13.4f, 11.4f), P(bounds, 17f, 15f) });
                        graphics.DrawEllipse(pen, R(bounds, 11.8f, 5f, 3.4f, 3.4f));
                        break;
                    case "play":
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 6f, 3.4f), P(bounds, 16f, 10f), P(bounds, 6f, 16.6f), P(bounds, 6f, 3.4f) });
                        break;
                    case "pause":
                        graphics.DrawLine(pen, P(bounds, 7f, 3.6f), P(bounds, 7f, 16.4f));
                        graphics.DrawLine(pen, P(bounds, 13f, 3.6f), P(bounds, 13f, 16.4f));
                        break;
                    case "next":
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 4f, 4f), P(bounds, 11.6f, 10f), P(bounds, 4f, 16f), P(bounds, 4f, 4f) });
                        graphics.DrawLine(pen, P(bounds, 14.6f, 4f), P(bounds, 14.6f, 16f));
                        break;
                    case "prev":
                        graphics.DrawLine(pen, P(bounds, 5.4f, 4f), P(bounds, 5.4f, 16f));
                        graphics.DrawLines(pen, new PointF[] { P(bounds, 16f, 4f), P(bounds, 8.4f, 10f), P(bounds, 16f, 16f), P(bounds, 16f, 4f) });
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

    // A capture preview floats over the desktop with no stock chrome, so the system
    // shadow is its only depth cue: CS_DROPSHADOW makes Windows draw one around the
    // window's region, which follows the rounded corners the caller sets.
    public sealed class ShotPreviewForm : Form
    {
        public ShotPreviewForm()
        {
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
            DoubleBuffered = true;
            ResizeRedraw = true;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ClassStyle |= 0x20000;
                return parameters;
            }
        }
    }

    // The recording bar is on screen while somebody is working in another window,
    // so neither showing it nor clicking it may take the focus away: WS_EX_NOACTIVATE
    // keeps it out of the foreground, and the drop shadow follows its rounded region
    // like the preview's.
    public sealed class RecordBarForm : Form
    {
        public RecordBarForm()
        {
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
            DoubleBuffered = true;
            ResizeRedraw = true;
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ClassStyle |= 0x20000;
                parameters.ExStyle |= 0x08000000;
                return parameters;
            }
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
# The music library the host publishes - tracks it has files for, the volume, the
# progress of a download, and whatever the settings card asked this process to do -
# and this process's own answer to it: what is playing. They are separate files
# because they move on separate clocks: the state file is a tick-by-tick snapshot,
# while the library changes only when somebody downloads or edits the settings.
$SCRIPT:MusicFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'music.json'
$SCRIPT:MusicPlayerFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'music-player.json'
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
# Where the video clip window starts its folder, as the settings card names it in
# the state file (see Apply-State). Blank leaves that window on the folder it
# remembered from its own last download.
$SCRIPT:VideoClipDir = ''
# Where a recording lands. Recordings are large and deliberately stay beside the
# state file rather than in the capture folder: the settings card has one field
# for the captures and one for the recordings, and each falls back to its own
# directory under this machine's harness home. The name is fixed when the
# recording starts, so the notice that follows names the file that exists.
$SCRIPT:DefaultRecordDir = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'recordings'
$SCRIPT:RecordDir = $SCRIPT:DefaultRecordDir
# The recording in flight: ffmpeg's process, the file it writes, the area it
# grabs, and when it started. All four are cleared by Stop-ScreenRecord, and the
# bar is a window of this process that shows the last two.
$SCRIPT:RecordProcess = $null
$SCRIPT:RecordArea = [System.Drawing.Rectangle]::Empty
$SCRIPT:RecordStartedAt = [DateTime]::MinValue
$SCRIPT:RecordFrameRate = 30
$SCRIPT:RecordPreset = 'ultrafast'
$SCRIPT:RecordCrf = 20
$SCRIPT:RecordBar = $null
$SCRIPT:RecordBarTimer = $null
$SCRIPT:RecordBarFont = $null
$SCRIPT:RecordBarMetrics = $null
$SCRIPT:RecordBarHover = $false
$SCRIPT:RecordMenuItems = @()
# The adjustable frame a recording starts from: the sheet draws it, the grips and
# the start window edit it, and only "Start recording" hands the area to ffmpeg.
# The frame is in the sheet's own coordinates; the area given to ffmpeg is that
# frame moved onto the desktop.
$SCRIPT:RecordMinSize = 32
$SCRIPT:RecordStage = ''
$SCRIPT:RecordFrame = [System.Drawing.Rectangle]::Empty
$SCRIPT:RecordHandle = -1
$SCRIPT:RecordDragOrigin = [System.Drawing.Point]::Empty
$SCRIPT:RecordFrameOrigin = [System.Drawing.Rectangle]::Empty
$SCRIPT:RecordFrameBar = $null
$SCRIPT:RecordFrameBarFont = $null
$SCRIPT:RecordFrameBarMetrics = $null
$SCRIPT:RecordFrameBarHover = $false
# The recording is written where it will stay, so the preview can play it from
# there without moving a file a player holds open; cancelling deletes it. The
# preview is a WPF player (MediaElement plus a seek bar), so its controls live in
# this process's own dispatcher rather than in a hand-drawn surface.
$SCRIPT:RecordFile = ''
$SCRIPT:RecordOutline = $null
$SCRIPT:RecordDuration = 0
$SCRIPT:RecordPreview = $null
$SCRIPT:RecordPreviewChoice = ''
$SCRIPT:RecordPreviewPath = ''
$SCRIPT:RecordPreviewSeconds = 0
$SCRIPT:RecordPreviewMedia = $null
$SCRIPT:RecordPreviewSlider = $null
$SCRIPT:RecordPreviewPlayText = $null
$SCRIPT:RecordPreviewTimeText = $null
$SCRIPT:RecordPreviewInfoText = $null
$SCRIPT:RecordPreviewTimer = $null
$SCRIPT:RecordPreviewSeeking = $false
# What the transport button did last, kept here because MediaElement's own IsPlaying
# lags behind a press: it is false while the file is still opening.
$SCRIPT:RecordPreviewPlaying = $false
$SCRIPT:RecordCancelMenuItems = @()
$SCRIPT:ShotMode = 'shot'
$SCRIPT:WindowVisible = $null
$SCRIPT:WindowForeground = $null
# Sampled before the click, never by it: whether DSH is the window in front is what
# a click acts on, and by the time the click is handled the press has already made
# the pet the foreground window.
$SCRIPT:DshInFront = $false
$SCRIPT:DshPid = $DshPid

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Get-Labels {
    $fallback = [ordered]@{
        PetName               = 'DSH pet'
        Chat                  = 'Chat'
        AlertNotice           = 'A task is waiting for your answer. Click the pet to return to DSH.'
        Git                   = 'Git changes'
        QuickAccess           = 'Quick access'
        QuickAccessHint       = 'Right-click to change a tile, Esc closes'
        QuickAccessCurrent    = 'Current'
        QuickAccessOpen       = 'Open'
        QuickAccessPick       = 'Choose folder...'
        QuickAccessPickShort  = 'Choose folder'
        QuickAccessPickTitle  = 'Choose the folder this tile opens'
        QuickAccessClear      = 'Clear this tile'
        QuickAccessNoCwd      = 'No working directory'
        QuickAccessFailed     = 'That folder could not be opened.'
        Settings              = 'Pet settings'
        Sites                 = 'Sites'
        Games                 = 'Mini games'
        Aquarium              = 'Glass aquarium'
        FishTank              = 'Pixel fish tank'
        Shot                  = 'Screenshot'
        ShotHint              = 'Drag to choose the area to capture, Esc cancels.'
        ShotPreviewTitle      = 'Screenshot preview'
        ShotSize              = '{0} x {1}'
        ShotFrameSize         = 'Frame {0} x {1}'
        ShotTarget            = 'Saves to: {0}'
        ShotSave              = 'Save'
        ShotCopy              = 'Copy only'
        ShotCancel            = 'Cancel'
        ShotPreviewHint       = 'Scroll to zoom, drag to pan'
        ShotPreviewKeys       = 'Enter saves, Esc cancels'
        ShotSaved             = 'Screenshot copied to the clipboard, and saved as a file'
        ShotSavedNoClipboard  = 'Screenshot saved as a file, but it could not be copied to the clipboard'
        ShotCopied            = 'Screenshot copied to the clipboard'
        ShotCopyFailed        = 'The screenshot could not be copied to the clipboard.'
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
        Features              = 'Special'
        VideoClip             = 'Video clip'
        VideoClipFailed       = 'The video clip window could not be opened.'
        VideoClipMissing      = 'video-clip.ps1 is missing beside pet.ps1, so nothing was opened.'
        Record                = 'Screen recording'
        RecordStart           = 'Start recording'
        RecordStop            = 'End recording'
        RecordCancel          = 'Cancel recording'
        RecordHint            = 'Drag a region, then drag its frame to adjust it; Esc cancels.'
        RecordFrameHint       = 'Adjust the frame, then start'
        RecordBarPrefix       = 'REC'
        RecordBarStop         = 'End recording'
        RecordStarted         = 'Recording the screen'
        RecordStartedHint     = 'Area {0} x {1}. End it from the floating bar or this menu.'
        RecordMenuStopHint    = 'The bar has nowhere to go over a full-screen recording; end it from the right-click menu.'
        RecordCancelled       = 'Recording cancelled'
        RecordPreviewTitle    = 'Recording preview'
        RecordPreviewInfo     = '{0} x {1} - {2}'
        RecordPreviewTarget   = 'Saves to: {0}'
        RecordPreviewHint     = 'Drag the bar to seek, Esc closes'
        RecordPlay            = 'Play'
        RecordPause           = 'Pause'
        RecordSave            = 'Save'
        RecordCopy            = 'Copy to clipboard'
        RecordPreviewCancel   = 'Cancel'
        RecordPreviewFailed   = 'This recording cannot be played.'
        RecordSaved           = 'Recording saved'
        RecordCopied          = 'Recording copied to the clipboard'
        RecordCopyFailed      = 'Recording saved, but it could not be copied to the clipboard'
        RecordFailed          = 'The recording could not be started.'
        RecordEmpty           = 'The recording wrote no file.'
        RecordMissingFfmpeg   = 'ffmpeg is missing, so nothing was recorded. Open Special > Video clip once; that window downloads it.'
        TempSpace             = 'Temp space'
        Music                 = 'Music'
        MusicPlay             = 'Play'
        MusicPause            = 'Pause'
        MusicNext             = 'Next song'
        MusicPrev             = 'Previous song'
        MusicNowPlaying       = 'Now playing: {0}'
        MusicPaused           = 'Paused: {0}'
        MusicDucked           = 'Paused while another app plays: {0}'
        MusicDuckedFade       = 'Turned down while another app plays: {0}'
        MusicReady            = 'Ready: {0}'
        MusicEmpty            = 'No songs downloaded yet'
        MusicEmptyHint        = 'Paste a Bilibili link under Settings, or fill them in below'
        MusicMissing          = '{0} not downloaded yet'
        MusicSync             = 'Download missing songs'
        MusicSyncCount        = 'Download missing songs ({0})'
        MusicSyncing          = 'Downloading: {0}/{1}'
        MusicSyncNone         = 'Every song is downloaded'
        MusicSynced           = 'Done: {0} added, {1} failed'
        MusicSyncRunning      = 'A download is already running'
        MusicOpenDir          = 'Open the music folder'
        MusicOpenFailed       = 'The music folder could not be opened.'
        MusicSettings         = 'Music settings'
        MusicFailed           = 'Playback failed: {0}'
        MusicVolume           = 'Volume ({0}%)'
        MusicVolumeSet        = 'Volume: {0}%'
        MusicAdded            = 'Added: {0}'
        MusicAddedMany        = 'Added {0} songs; use Download missing to fetch them'
        MusicDuplicate        = 'That link is already in the list.'
        MusicAddFailed        = 'Could not add it ({0})'
        MusicStage            = 'Listening mode'
        MusicStageFailed      = 'The listening mode could not be opened.'
        StageImage            = 'Listening mode picture...'
        StageImageClear       = 'Use the desktop wallpaper'
        StageImageTitle       = 'Choose the picture behind the listening mode'
        StageImageFilter      = 'Pictures|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp'
        StageImageUnsupported = 'The listening mode cannot draw that file. Use jpg, png, bmp, gif, or webp.'
        StageImageFailed      = 'No picture was chosen.'
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

# What a click on the pet means. A click says "I want to look at DSH", so it hides
# only a window that is already the one in front; a window that is merely behind
# another application is raised instead of being tucked away. Deciding on whether
# the window is on screen alone turned a click made while working in another
# application into "make DSH disappear", which is the opposite of what it meant.
# A window that is not on screen is raised whichever way the foreground question
# answers, because a hidden window is nobody's foreground window.
function Get-ClickIntent([bool]$Shown, [bool]$InFront) {
    if ($Shown -and $InFront) { return 'hide' }
    return 'show'
}

# Whether entering this state is news worth a reminder. Only the step into `alert`
# is one: the first state a pet applies is not a transition, and a state file
# rewritten while the agent still waits must not ring again on every tick.
function Test-ShouldAnnounceAlert([string]$Previous, [string]$Next, [bool]$Enabled) {
    if (-not $Enabled) { return $false }
    if ($Next -ne 'alert') { return $false }
    return ($Previous -ne '' -and $Previous -ne 'alert')
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
# The directory of the Session DSH is showing, as the page reported it. The pet
# has no other way to learn which folder that is, and the quick access panel
# pins it in the middle of its nine tiles.
$SCRIPT:MainCwd = ''
# Whether the host's published reminder is on. Set before the first state is
# applied, and only ever changed by a newer state file.
$SCRIPT:AlertNotice = $true
$SCRIPT:Ticks = 0
$SCRIPT:PetMenu = $null
$SCRIPT:UpdateMenuItem = $null
# Music: the library the host published, the MediaPlayer that owns the audio, what
# this process last reported about it, and the submenu itself. The submenu is
# rebuilt at every open because a download that finished in between, a volume the
# settings card changed, and a track that started playing all change what it says.
$SCRIPT:MusicLibrary = $null
$SCRIPT:MusicTracks = @()
# Whether the playlist being played is shuffled, as the host published it.
$SCRIPT:MusicShuffle = $false
$SCRIPT:MusicVolume = 70
$SCRIPT:MusicDir = ''
$SCRIPT:MusicMissing = 0
$SCRIPT:MusicSync = $null
# The picture the page's listening mode draws, as the host published it: a path the
# person chose from this menu, or empty for the desktop wallpaper. The menu offers the
# way back only while one is chosen, so this is read at every rebuild.
$SCRIPT:StageImage = ''
$SCRIPT:MusicMenu = $null
$SCRIPT:Music = $null
$SCRIPT:MusicIndex = -1
$SCRIPT:MusicCurrentId = ''
$SCRIPT:MusicCurrentFile = ''
$SCRIPT:MusicPlaying = $false
$SCRIPT:MusicStarted = $false
$SCRIPT:MusicOpened = $false
# Which open the current media is, and which one actually opened: MediaPlayer reports
# the media it replaced as having ended, so a track whose open never completed must
# not be treated as a finished one (see Get-MusicPlayer).
$SCRIPT:MusicGeneration = 0
$SCRIPT:MusicOpenGeneration = -1
$SCRIPT:MusicResumeMs = 0
$SCRIPT:MusicError = ''
$SCRIPT:MusicCommandAt = 0
$SCRIPT:MusicNoticeAt = 0
# The volume slider is hosted inside the music submenu, which is rebuilt at every
# open: these point at the current row's controls. A drag moves the value many times
# and each step is audible at once, so only the settled value is written to the
# configuration (see Update-MusicVolumeCommit).
$SCRIPT:MusicVolumeSlider = $null
$SCRIPT:MusicVolumeLabel = $null
$SCRIPT:MusicVolumePending = $null
$SCRIPT:MusicVolumeDueAt = 0
# The track and position this machine last played, taken from music-player.json
# before the first library arrives: a restart of DSH brings the pet back where the
# person left off rather than at the top of the list.
$SCRIPT:MusicRestore = $false
$SCRIPT:MusicSavedId = ''
$SCRIPT:MusicSavedPositionMs = 0
$SCRIPT:MusicSavedPlaying = $false
# Whether this process steps aside while another application plays sound, how it
# does that, how far down it goes, and how many seconds that application has to
# stay quiet before the pet comes back. All four travel with the library the host
# publishes. The counters are what the decision carries from one sample to the
# next, and MusicSteppedAside is the one fact that tells a step this process took
# from a pause the person asked for: without it, a person's own pause would come
# back on its own the moment a video ended.
$SCRIPT:MusicDuck = $true
$SCRIPT:MusicDuckHoldSeconds = 3
$SCRIPT:MusicDuckMode = 'fade'
$SCRIPT:MusicDuckLevel = 20
$SCRIPT:MusicSteppedAside = $false
$SCRIPT:DuckLoud = 0
$SCRIPT:DuckQuiet = 0
# A session that is merely open reports peaks at the noise floor, so a peak this
# small is silence; and a sound has to last this many samples (one a second) before
# the music steps aside, which is what keeps a notification ding out of it.
$SCRIPT:DuckPeak = 0.02
$SCRIPT:DuckSustainSamples = 2
# The fade: one multiplier on the configured volume, walked toward its target every
# 50 ms so a step aside is heard as a slope rather than as a jump. A second is slow
# enough to read as a gesture and fast enough to be out of the way of a video that
# just started.
$SCRIPT:DuckFadeMs = 1000
$SCRIPT:DuckFadeStepMs = 50
$SCRIPT:DuckGain = 1.0
$SCRIPT:DuckTarget = 1.0
$SCRIPT:DuckTimer = $null
$SCRIPT:MusicStamp = [DateTime]::MinValue
$SCRIPT:BuildStartedAt = 0
$SCRIPT:Exiting = $false
# The quick access panel and what it is showing: the nine tiles, the Explorer
# windows that are open right now (folder -> handle), the tile under the pointer
# and the one the keyboard is on, and the last failure a click ran into. One
# panel exists at a time, and its tiles are rebuilt whenever it opens.
$SCRIPT:QuickAccess = $null
$SCRIPT:QuickAccessSlots = @()
$SCRIPT:QuickAccessTiles = @()
$SCRIPT:QuickAccessOpen = @{}
# The tile's own menu while it is open, so a panel that goes away takes it too,
# and which ring entry it is acting on.
$SCRIPT:QuickAccessMenu = $null
$SCRIPT:QuickAccessMenuRing = -1
$SCRIPT:QuickAccessMenuClearItem = $null
# What a menu choice asked for, carried from the click to the next message: the
# menu is still dismissing while the click handler runs.
$SCRIPT:QuickAccessPendingAction = ''
$SCRIPT:QuickAccessPendingRing = -1
# The eight folders the person assigned to the ring, in the order the tiles take
# them, plus the tile each one belongs to. The list is this machine's own and is
# read on first use; the order skips the fixed middle tile.
$SCRIPT:QuickAccessUser = $null
$SCRIPT:QuickAccessOrder = @(0, 1, 2, 3, 5, 6, 7, 8)
$SCRIPT:QuickAccessHover = -1
$SCRIPT:QuickAccessFocus = 4
$SCRIPT:QuickAccessError = ''
# Whether a dialog or the tile's own menu owns the foreground: the panel must not
# read that as the person leaving.
$SCRIPT:QuickAccessBusy = $false
$SCRIPT:QuickAccessScale = 1.0
$SCRIPT:QuickAccessShownAt = 0
# The single Shell.Application this process asks about quick access and open
# folder windows. Built on first use and kept, because building it costs more
# than either question does.
$SCRIPT:Shell = $null

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

function Get-CheckoutRepository([string]$CommandLine) {
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
    return $repository
}

function Get-DesktopBuildScript([string]$CommandLine) {
    $repository = Get-CheckoutRepository $CommandLine
    if ([string]::IsNullOrWhiteSpace($repository)) { return $null }
    $script = Join-Path $repository '_mytools\build\build-desktop.bat'
    if (-not (Test-Path -LiteralPath (Join-Path $repository 'package.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath $script -PathType Leaf)) { return $null }
    return $script
}

function Get-SettingsSyncScript([string]$CommandLine) {
    # Where the checkout keeps the tool that merges its committed settings (the
    # pet's profile section and the Desktop's shortcut document) into a machine.
    # Restarting from this menu replays the Electron command line instead of going
    # through build\start-desktop.bat, so the merge that launcher performs before
    # every start has to be run here as well; otherwise a settings file pulled on
    # this machine would wait for a start made another way.
    $repository = Get-CheckoutRepository $CommandLine
    if ([string]::IsNullOrWhiteSpace($repository)) { return $null }
    $script = Join-Path $repository '_mytools\settings\sync-settings.mjs'
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { return $null }
    return $script
}

function Invoke-SettingsSync([string]$Script) {
    # A failure here is reported and the restart continues: coming back with the
    # pet as it was beats not coming back at all. Node is the same requirement the
    # launcher has, and it is looked up rather than assumed so a machine without
    # it says so once instead of failing the restart.
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        Write-Log 'settings sync skipped: node is not on PATH'
        return
    }
    $name = 'pet-settings-sync-' + [guid]::NewGuid().ToString('N')
    $outLog = Join-Path ([System.IO.Path]::GetTempPath()) ($name + '.out.log')
    $errLog = Join-Path ([System.IO.Path]::GetTempPath()) ($name + '.err.log')
    try {
        # Not --quiet: a merge that changed this profile is worth one line in the
        # log, and the line reads the same whether a person restarts from the menu
        # or the launcher does it before a start. Newlines are folded so the log
        # stays one line per event.
        $process = Start-Process -FilePath $node.Source `
            -ArgumentList @("`"$Script`"", 'apply', '--profile', 'desktop') `
            -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        $text = if (Test-Path -LiteralPath $outLog) { (Get-Content -LiteralPath $outLog -Raw).Trim() } else { '' }
        if ($text -ne '') { Write-Log "settings sync: $($text -replace "`r?`n", ' | ')" }
        if ($process.ExitCode -ne 0) {
            $errors = if (Test-Path -LiteralPath $errLog) { (Get-Content -LiteralPath $errLog -Raw).Trim() } else { '' }
            Write-Log "settings sync failed with code $($process.ExitCode): $errors"
        }
    } catch {
        Write-Log "settings sync could not run: $($_.Exception.Message)"
    } finally {
        Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue
    }
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
        $sync = Get-SettingsSyncScript $command
        if (-not [string]::IsNullOrWhiteSpace($sync)) { Invoke-SettingsSync $sync }
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

function Get-ShotFileName {
    # Milliseconds in the name: two captures inside the same second are ordinary.
    # Built without touching the disk, because the preview names the file before
    # the person has agreed to write one.
    return (Join-Path $SCRIPT:ShotDir ('shot-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '.png'))
}

function New-ShotPath {
    if (-not (Test-Path -LiteralPath $SCRIPT:ShotDir)) {
        [void][System.IO.Directory]::CreateDirectory($SCRIPT:ShotDir)
    }
    return (Get-ShotFileName)
}

# ---- screen recording (process and files) ------------------------------------
# A recording is the same desktop the capture reads, run as a child process:
# ffmpeg's gdigrab grabs the area and libx264 writes an H.264 file. The pet owns
# the process because it is the half that can draw a stop bar over the desktop,
# and because a recording has to keep running while DSH is tucked away. Nothing
# here opens a window: the sheet, the bar, and the notice are built further down,
# next to the menu that opens them.
function Get-DshHomePath {
    # The same rule the video clip window uses, so both halves find one download.
    $raw = $env:DSH_HOME
    $value = if ($null -eq $raw) { '' } else { $raw.Trim() }
    if ($value -eq '') { return (Join-Path $HOME '.dsh') }
    if ($value -eq '~') { return $HOME }
    if ($value.StartsWith('~/') -or $value.StartsWith('~\')) { return (Join-Path $HOME $value.Substring(2)) }
    return [System.IO.Path]::GetFullPath($value)
}

function Find-FfmpegDir {
    # The video clip window downloads ffmpeg into the harness home; a machine that
    # already has one on PATH, or names one in DSH_FFMPEG, needs no download.
    $candidates = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_FFMPEG)) { [void]$candidates.Add($env:DSH_FFMPEG) }
    $root = Get-DshHomePath
    [void]$candidates.Add((Join-Path $root 'tools\ffmpeg\bin'))
    [void]$candidates.Add((Join-Path $root 'tools\ffmpeg'))
    foreach ($dir in $candidates) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        if (Test-Path -LiteralPath (Join-Path $dir 'ffmpeg.exe') -PathType Leaf) { return $dir }
    }
    $command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) { return [System.IO.Path]::GetDirectoryName($command.Source) }
    return ''
}

function Quote-ProcessArgument([string]$Value) {
    # Windows PowerShell has no argument list on ProcessStartInfo: the command line
    # is one string, so every argument is quoted by hand.
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Get-RecordArea([System.Drawing.Rectangle]$Rectangle, [System.Drawing.Rectangle]$Bounds) {
    # A recording cannot reach past the desktop, and x264 with yuv420p wants even
    # dimensions: one row and column less is invisible, a refused encode is not.
    $left = [Math]::Max($Rectangle.Left, $Bounds.Left)
    $top = [Math]::Max($Rectangle.Top, $Bounds.Top)
    $right = [Math]::Min($Rectangle.Right, $Bounds.Right)
    $bottom = [Math]::Min($Rectangle.Bottom, $Bounds.Bottom)
    $width = [Math]::Max(0, $right - $left)
    $height = [Math]::Max(0, $bottom - $top)
    $width -= ($width % 2)
    $height -= ($height % 2)
    return [System.Drawing.Rectangle]::new($left, $top, $width, $height)
}

function Get-RecordRectangle($Start, $End, [System.Drawing.Rectangle]$Bounds) {
    return (Get-RecordArea (Get-ShotRectangle $Start $End) $Bounds)
}

function Get-RecordFileName([string]$Directory) {
    # Named when the recording starts, because the notice that follows it names the
    # file the person is about to open. No folder is created here: a cancelled
    # selection leaves the disk as it was.
    return (Join-Path $Directory ('record-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '.mp4'))
}

function Format-RecordClock([long]$Milliseconds) {
    $total = [long][Math]::Floor($Milliseconds / 1000)
    $hours = [long][Math]::Floor($total / 3600)
    $minutes = [long][Math]::Floor(($total % 3600) / 60)
    $seconds = $total % 60
    if ($hours -gt 0) { return ('{0}:{1:00}:{2:00}' -f $hours, $minutes, $seconds) }
    return ('{0:00}:{1:00}' -f $minutes, $seconds)
}

function Format-RecordSize([long]$Bytes) {
    # A one-second take is kilobytes and an hour is megabytes; one number in the
    # wrong unit reads as a broken file.
    $invariant = [System.Globalization.CultureInfo]::InvariantCulture
    if ($Bytes -ge 1MB) { return ([string]::Format($invariant, '{0:N1} MB', ($Bytes / 1MB))) }
    return ([string]::Format($invariant, '{0:N0} KB', [Math]::Max(1, [Math]::Round($Bytes / 1KB))))
}

function Get-RecordArguments([System.Drawing.Rectangle]$Area, [string]$Path) {
    # Kept a function of its own so the self test can print exactly what ffmpeg is
    # started with. gdigrab's offsets are screen coordinates rather than offsets
    # from the virtual screen's corner, so the area's own left and top are handed
    # over unchanged; the capture sheet works in the same coordinates.
    return @(
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'gdigrab',
        '-framerate', [string]$SCRIPT:RecordFrameRate,
        '-draw_mouse', '1',
        '-offset_x', [string]$Area.Left,
        '-offset_y', [string]$Area.Top,
        '-video_size', ('{0}x{1}' -f $Area.Width, $Area.Height),
        '-i', 'desktop',
        '-c:v', 'libx264',
        '-preset', $SCRIPT:RecordPreset,
        '-crf', [string]$SCRIPT:RecordCrf,
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        $Path
    )
}

function Get-RecordFrameHandles([System.Drawing.Rectangle]$Frame) {
    # The eight grips a window has: four corners and four edge midpoints, each a
    # square box centred on the point so a click near it counts.
    $box = 12
    $half = [int]($box / 2)
    $centreX = $Frame.Left + [int]($Frame.Width / 2)
    $centreY = $Frame.Top + [int]($Frame.Height / 2)
    $points = @(
        [System.Drawing.Point]::new($Frame.Left, $Frame.Top),
        [System.Drawing.Point]::new($centreX, $Frame.Top),
        [System.Drawing.Point]::new($Frame.Right, $Frame.Top),
        [System.Drawing.Point]::new($Frame.Right, $centreY),
        [System.Drawing.Point]::new($Frame.Right, $Frame.Bottom),
        [System.Drawing.Point]::new($centreX, $Frame.Bottom),
        [System.Drawing.Point]::new($Frame.Left, $Frame.Bottom),
        [System.Drawing.Point]::new($Frame.Left, $centreY)
    )
    $handles = @()
    foreach ($point in $points) {
        $handles += [System.Drawing.Rectangle]::new(($point.X - $half), ($point.Y - $half), $box, $box)
    }
    return $handles
}

function Get-RecordFrameHandle([System.Drawing.Rectangle]$Frame, [System.Drawing.Point]$Point) {
    if ($Frame.Width -le 0 -or $Frame.Height -le 0) { return -1 }
    $handles = Get-RecordFrameHandles $Frame
    for ($index = 0; $index -lt $handles.Count; $index++) {
        if ($handles[$index].Contains($Point)) { return $index }
    }
    return -1
}

function Get-RecordFrameHandleBoxes([System.Drawing.Rectangle]$Frame) {
    # Where the grips are painted: just outside the frame, because the frame's own
    # edge is the hole cut out of the sheet and nothing drawn there is visible. A
    # little larger than the box that catches the press, so a grip can be seen and
    # aimed at through the sheet's translucency.
    $size = 10
    $offset = 5
    $half = [int]($size / 2)
    $handles = Get-RecordFrameHandles $Frame
    $boxes = @()
    for ($index = 0; $index -lt $handles.Count; $index++) {
        $centre = [System.Drawing.Point]::new(($handles[$index].Left + 6), ($handles[$index].Top + 6))
        $dx = 0
        $dy = 0
        switch ($index) {
            0 { $dx = -$offset; $dy = -$offset }
            1 { $dy = -$offset }
            2 { $dx = $offset; $dy = -$offset }
            3 { $dx = $offset }
            4 { $dx = $offset; $dy = $offset }
            5 { $dy = $offset }
            6 { $dx = -$offset; $dy = $offset }
            7 { $dx = -$offset }
        }
        $boxes += [System.Drawing.Rectangle]::new(($centre.X + $dx - $half), ($centre.Y + $dy - $half), $size, $size)
    }
    return $boxes
}

function Resize-RecordFrame([System.Drawing.Rectangle]$Frame, [int]$Handle, [System.Drawing.Point]$Delta,
    [System.Drawing.Rectangle]$Bounds) {
    # A grip moves one edge, or two at a corner, while the opposite edge stays
    # put. The result is clipped to the desktop and never smaller than the
    # smallest recording, so a frame can always be grabbed again.
    $left = $Frame.Left; $top = $Frame.Top; $right = $Frame.Right; $bottom = $Frame.Bottom
    switch ($Handle) {
        0 { $left += $Delta.X; $top += $Delta.Y }
        1 { $top += $Delta.Y }
        2 { $right += $Delta.X; $top += $Delta.Y }
        3 { $right += $Delta.X }
        4 { $right += $Delta.X; $bottom += $Delta.Y }
        5 { $bottom += $Delta.Y }
        6 { $left += $Delta.X; $bottom += $Delta.Y }
        7 { $left += $Delta.X }
    }
    $left = [Math]::Max($Bounds.Left, [Math]::Min($left, ($right - $SCRIPT:RecordMinSize)))
    $top = [Math]::Max($Bounds.Top, [Math]::Min($top, ($bottom - $SCRIPT:RecordMinSize)))
    $right = [Math]::Min($Bounds.Right, [Math]::Max($right, ($left + $SCRIPT:RecordMinSize)))
    $bottom = [Math]::Min($Bounds.Bottom, [Math]::Max($bottom, ($top + $SCRIPT:RecordMinSize)))
    return [System.Drawing.Rectangle]::new($left, $top, ($right - $left), ($bottom - $top))
}

function Move-RecordFrame([System.Drawing.Rectangle]$Frame, [System.Drawing.Point]$Delta,
    [System.Drawing.Rectangle]$Bounds) {
    $x = [Math]::Min([Math]::Max(($Frame.Left + $Delta.X), $Bounds.Left), ($Bounds.Right - $Frame.Width))
    $y = [Math]::Min([Math]::Max(($Frame.Top + $Delta.Y), $Bounds.Top), ($Bounds.Bottom - $Frame.Height))
    return [System.Drawing.Rectangle]::new($x, $y, $Frame.Width, $Frame.Height)
}

function Get-RecordFrameCursor([int]$Handle) {
    switch ($Handle) {
        0 { return [System.Windows.Forms.Cursors]::SizeNWSE }
        1 { return [System.Windows.Forms.Cursors]::SizeNS }
        2 { return [System.Windows.Forms.Cursors]::SizeNESW }
        3 { return [System.Windows.Forms.Cursors]::SizeWE }
        4 { return [System.Windows.Forms.Cursors]::SizeNWSE }
        5 { return [System.Windows.Forms.Cursors]::SizeNS }
        6 { return [System.Windows.Forms.Cursors]::SizeNESW }
        7 { return [System.Windows.Forms.Cursors]::SizeWE }
        default { return [System.Windows.Forms.Cursors]::Default }
    }
}

function Get-RecordFrameBarBounds([System.Drawing.Rectangle]$Frame, [System.Drawing.Size]$Size,
    [System.Drawing.Rectangle]$Screen) {
    # Under the frame, or above it when the frame reaches the bottom of the screen.
    # It may overlap the frame: nothing is being recorded yet, so the button cannot
    # end up in a recording.
    $x = $Frame.Left + [int](($Frame.Width - $Size.Width) / 2)
    $y = $Frame.Bottom + 12
    if (($y + $Size.Height) -gt ($Screen.Bottom - 8)) { $y = $Frame.Top - $Size.Height - 12 }
    $x = [Math]::Min([Math]::Max($x, ($Screen.Left + 8)), [Math]::Max(($Screen.Left + 8), ($Screen.Right - $Size.Width - 8)))
    $y = [Math]::Min([Math]::Max($y, ($Screen.Top + 8)), [Math]::Max(($Screen.Top + 8), ($Screen.Bottom - $Size.Height - 8)))
    return [System.Drawing.Rectangle]::new($x, $y, $Size.Width, $Size.Height)
}

function Get-RecordBarBounds([System.Drawing.Rectangle]$Area, [System.Drawing.Size]$Size,
    [System.Drawing.Rectangle]$Desktop) {
    # The bar must not appear in the recording it controls: every candidate sits
    # outside the area, and the two desktop corners are the fallback for an area
    # that all but fills the screen. No candidate left means no bar - the menu
    # still stops the recording.
    $gap = 12
    $centreX = $Area.Left + [int](($Area.Width - $Size.Width) / 2)
    $centreY = $Area.Top + [int](($Area.Height - $Size.Height) / 2)
    $candidates = @(
        [System.Drawing.Point]::new($centreX, ($Area.Top - $Size.Height - $gap)),
        [System.Drawing.Point]::new($centreX, ($Area.Bottom + $gap)),
        [System.Drawing.Point]::new(($Area.Right + $gap), $centreY),
        [System.Drawing.Point]::new(($Area.Left - $Size.Width - $gap), $centreY),
        [System.Drawing.Point]::new(($Desktop.Right - $Size.Width - 16), ($Desktop.Top + 16)),
        [System.Drawing.Point]::new(($Desktop.Right - $Size.Width - 16), ($Desktop.Bottom - $Size.Height - 16))
    )
    foreach ($candidate in $candidates) {
        $x = [Math]::Min([Math]::Max($candidate.X, ($Desktop.Left + 8)),
            [Math]::Max(($Desktop.Left + 8), ($Desktop.Right - $Size.Width - 8)))
        $y = [Math]::Min([Math]::Max($candidate.Y, ($Desktop.Top + 8)),
            [Math]::Max(($Desktop.Top + 8), ($Desktop.Bottom - $Size.Height - 8)))
        $bounds = [System.Drawing.Rectangle]::new($x, $y, $Size.Width, $Size.Height)
        if (-not $bounds.IntersectsWith($Area)) { return $bounds }
    }
    return [System.Drawing.Rectangle]::Empty
}

function Get-RecordPreviewLayout([int]$Width, [int]$Height, [System.Drawing.Rectangle]$Area) {
    # The poster is shown whole and never blown up: a small recording drawn large
    # would only be blurrier, and the frame is there to recognise the take, not to
    # read it.
    $maxWidth = [Math]::Min(960, [Math]::Max(320, [int]($Area.Width * 0.55)))
    $maxHeight = [Math]::Min(720, [Math]::Max(200, [int]($Area.Height * 0.55)))
    $scale = [Math]::Min(1.0, [Math]::Min(($maxWidth / [double]$Width), ($maxHeight / [double]$Height)))
    return [pscustomobject]@{
        ImageWidth  = [Math]::Max(1, [int][Math]::Round($Width * $scale))
        ImageHeight = [Math]::Max(1, [int][Math]::Round($Height * $scale))
        Scale       = $scale
    }
}


function Start-RecordProcess([System.Drawing.Rectangle]$Area, [string]$Path) {
    # No window and no console: the recording is a background child of the pet,
    # and its standard input is how it is asked to finish cleanly. Killing it
    # leaves an MP4 with no moov atom, which nothing can play.
    $ffmpegDir = Find-FfmpegDir
    if ([string]::IsNullOrWhiteSpace($ffmpegDir)) { throw $SCRIPT:Labels.RecordMissingFfmpeg }
    $arguments = @(Get-RecordArguments $Area $Path | ForEach-Object { Quote-ProcessArgument $_ })
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $ffmpegDir 'ffmpeg.exe'
    $info.Arguments = ($arguments -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    return [System.Diagnostics.Process]::Start($info)
}

function Stop-RecordProcess($Process) {
    # Returns ffmpeg's own exit code, or -1 when it had to be killed. A caller that
    # ignores both still gets a file: 'q' is what ffmpeg reads to finish.
    $code = -1
    try {
        if (-not $Process.HasExited) {
            try {
                $Process.StandardInput.WriteLine('q')
                $Process.StandardInput.Flush()
            } catch {
                Write-Log "asking ffmpeg to stop failed: $($_.Exception.Message)"
            }
            if (-not $Process.WaitForExit(20000)) {
                Write-Log 'ffmpeg did not stop on request; killing it'
                try { $Process.Kill() } catch { }
                [void]$Process.WaitForExit(5000)
            }
        }
        if ($Process.HasExited) { $code = $Process.ExitCode }
    } catch {
        Write-Log "stopping the recording failed: $($_.Exception.Message)"
    }
    return $code
}

function Test-RecordFile([string]$Path) {
    # A stopped recording that wrote nothing is a failure the person has to hear
    # about: the bar is gone, and an empty MP4 is not something to open.
    try {
        return (Test-Path -LiteralPath $Path -PathType Leaf) -and ((Get-Item -LiteralPath $Path).Length -gt 0)
    } catch {
        return $false
    }
}

function Select-RecordDir($State) {
    # The host leaves the field out while the setting is blank, and an empty setting
    # is this machine's own recordings directory rather than a directory named by
    # nothing - the same rule captures follow.
    if ($null -ne $State -and $null -ne $State.recordDir -and -not [string]::IsNullOrWhiteSpace([string]$State.recordDir)) {
        return [string]$State.recordDir
    }
    return $SCRIPT:DefaultRecordDir
}

function Update-RecordMenu {
    # The row is one row either way: idle it starts a selection, during a recording
    # it ends one. Cancelling is a second row that only exists while a recording
    # runs, so the menu never offers to drop something that is not being recorded.
    $recording = $null -ne $SCRIPT:RecordProcess
    $text = if ($recording) { $SCRIPT:Labels.RecordStop } else { $SCRIPT:Labels.Record }
    $icon = if ($recording) { 'stop' } else { 'record' }
    foreach ($item in @($SCRIPT:RecordMenuItems)) {
        if ($null -eq $item) { continue }
        $item.Text = $text
        $item.Tag = $icon
    }
    foreach ($item in @($SCRIPT:RecordCancelMenuItems)) {
        if ($null -eq $item) { continue }
        $item.Available = $recording
    }
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

function Get-ShotPreviewLayout([int]$Width, [int]$Height, [System.Drawing.Rectangle]$Area) {
    # A capture is never blown up: a 320x200 selection drawn 960 wide would only be
    # blurrier. A large one is shrunk to fit 960x720 and the screen it came from, with
    # room left for the labels and the buttons under it. Pure, so the self test can read it.
    $maxWidth = [Math]::Min(960, [Math]::Max(240, [int]($Area.Width * 0.7)))
    $maxHeight = [Math]::Min(720, [Math]::Max(160, [int]($Area.Height * 0.7)))
    $scale = [Math]::Min(1.0, [Math]::Min($maxWidth / [double]$Width, $maxHeight / [double]$Height))
    return [pscustomobject]@{
        ImageWidth  = [Math]::Max(1, [int][Math]::Round($Width * $scale))
        ImageHeight = [Math]::Max(1, [int][Math]::Round($Height * $scale))
        Scale       = $scale
    }
}

function Get-ShotPreviewMetrics([int]$ImageWidth, [int]$ImageHeight, [System.Drawing.Font]$Font) {
    # Every box the preview draws, measured from the font: this process is
    # per-monitor DPI aware, so 9pt is 20px tall at 125% and a layout pinned to
    # 96dpi pixels would drift or clip. Pure, so the probe can lay it out with no
    # window and the self test can read it.
    $scale = [Math]::Max(1.0, $Font.Height / 16.0)
    $pad = [int][Math]::Round(24 * $scale)
    $titleHeight = [int][Math]::Round(48 * $scale)
    $frameInset = [int][Math]::Round(12 * $scale)
    $buttonWidth = [int][Math]::Round(88 * $scale)
    $buttonHeight = [int][Math]::Round(34 * $scale)
    $buttonGap = [int][Math]::Round(8 * $scale)
    $closeSize = [int][Math]::Round(30 * $scale)
    $frameWidth = $ImageWidth + ($frameInset * 2)
    $frameHeight = $ImageHeight + ($frameInset * 2)
    $buttonRow = ($buttonWidth * 3) + ($buttonGap * 2)
    # As wide as the picture or the button row needs, and no wider: a small capture
    # should not carry a band of empty space beside it.
    $width = [Math]::Max(($frameWidth + ($pad * 2)), ($buttonRow + ($pad * 2)))
    $imageTop = $titleHeight + [int][Math]::Round(8 * $scale)
    $sizeHeight = [int][Math]::Round(22 * $scale)
    $sizeTop = $imageTop + $frameHeight + [int][Math]::Round(18 * $scale)
    $pathHeight = [int][Math]::Round(20 * $scale)
    $pathTop = $sizeTop + $sizeHeight + [int][Math]::Round(4 * $scale)
    $buttonsTop = $pathTop + $pathHeight + [int][Math]::Round(22 * $scale)
    $height = $buttonsTop + $buttonHeight + $pad
    $frameLeft = [int][Math]::Round(($width - $frameWidth) / 2)
    $closeLeft = $width - $pad - $closeSize
    $closeTop = [int][Math]::Round(($titleHeight - $closeSize) / 2)
    $hintRight = $closeLeft - [int][Math]::Round(20 * $scale)
    $hintWidth = [int][Math]::Round(170 * $scale)
    $cancelLeft = $width - $pad - $buttonWidth
    $copyLeft = $cancelLeft - $buttonGap - $buttonWidth
    $saveLeft = $copyLeft - $buttonGap - $buttonWidth
    return [pscustomobject]@{
        Scale        = $scale
        Width        = $width
        Height       = $height
        Padding      = $pad
        FrameInset   = $frameInset
        TitleHeight  = $titleHeight
        TitleRect    = [System.Drawing.Rectangle]::new($frameLeft, 0, ($closeLeft - $frameLeft - [int][Math]::Round(16 * $scale)), $titleHeight)
        HintRect     = [System.Drawing.Rectangle]::new(($hintRight - $hintWidth), 0, $hintWidth, $titleHeight)
        CloseRect    = [System.Drawing.Rectangle]::new($closeLeft, $closeTop, $closeSize, $closeSize)
        FrameRect    = [System.Drawing.Rectangle]::new($frameLeft, $imageTop, $frameWidth, $frameHeight)
        ImageRect    = [System.Drawing.Rectangle]::new(($frameLeft + $frameInset), ($imageTop + $frameInset), $ImageWidth, $ImageHeight)
        SizeRect     = [System.Drawing.Rectangle]::new($frameLeft, $sizeTop, $frameWidth, $sizeHeight)
        PathRect     = [System.Drawing.Rectangle]::new($frameLeft, $pathTop, $frameWidth, $pathHeight)
        SaveRect     = [System.Drawing.Rectangle]::new($saveLeft, $buttonsTop, $buttonWidth, $buttonHeight)
        CopyRect     = [System.Drawing.Rectangle]::new($copyLeft, $buttonsTop, $buttonWidth, $buttonHeight)
        CancelRect   = [System.Drawing.Rectangle]::new($cancelLeft, $buttonsTop, $buttonWidth, $buttonHeight)
        ButtonHeight = $buttonHeight
    }
}

function Get-ShotPreviewDrawRect($Metrics, $Bitmap, [double]$Zoom, [System.Drawing.Point]$Offset) {
    # The capture drawn at viewport scale times the zoom, shifted from the centre by
    # the pan offset. Pure, so the self test can read what a given zoom produces and
    # the same numbers drive both the paint and the pointer maths.
    $base = $Metrics.ImageRect.Width / [double]$Bitmap.Width
    $width = [Math]::Max(1, [int][Math]::Round($Bitmap.Width * $base * $Zoom))
    $height = [Math]::Max(1, [int][Math]::Round($Bitmap.Height * $base * $Zoom))
    $left = $Metrics.ImageRect.Left + [int][Math]::Round(($Metrics.ImageRect.Width - $width) / 2.0) + $Offset.X
    $top = $Metrics.ImageRect.Top + [int][Math]::Round(($Metrics.ImageRect.Height - $height) / 2.0) + $Offset.Y
    return [System.Drawing.Rectangle]::new($left, $top, $width, $height)
}

function Set-ShotPreviewOffset($Metrics, [double]$Zoom, [System.Drawing.Point]$Offset) {
    # A panned picture stops at its own edge: a capture never slides off the frame
    # and leaves a band of empty mat showing. At 1x the only valid offset is zero.
    $maxX = [int][Math]::Max(0, [Math]::Round($Metrics.ImageRect.Width * ($Zoom - 1.0) / 2.0))
    $maxY = [int][Math]::Max(0, [Math]::Round($Metrics.ImageRect.Height * ($Zoom - 1.0) / 2.0))
    $x = [Math]::Min($maxX, [Math]::Max(-$maxX, $Offset.X))
    $y = [Math]::Min($maxY, [Math]::Max(-$maxY, $Offset.Y))
    return [System.Drawing.Point]::new($x, $y)
}

function Get-ShotPreviewSourceRect($Metrics, $Bitmap, [double]$Zoom, [System.Drawing.Point]$Offset) {
    # What the frame shows, in the capture's own pixels: the saved picture is this
    # rectangle at 1:1, so zooming in crops instead of softening. Pure, so the self
    # test can read it and the save path cannot disagree with what was drawn.
    $scale = ($Metrics.ImageRect.Width / [double]$Bitmap.Width) * $Zoom
    if ($scale -le 0) { return [System.Drawing.Rectangle]::new(0, 0, $Bitmap.Width, $Bitmap.Height) }
    $drawn = Get-ShotPreviewDrawRect $Metrics $Bitmap $Zoom $Offset
    $x = [int][Math]::Round(($Metrics.ImageRect.Left - $drawn.Left) / $scale)
    $y = [int][Math]::Round(($Metrics.ImageRect.Top - $drawn.Top) / $scale)
    $width = [Math]::Min($Bitmap.Width, [int][Math]::Round($Metrics.ImageRect.Width / $scale))
    $height = [Math]::Min($Bitmap.Height, [int][Math]::Round($Metrics.ImageRect.Height / $scale))
    $x = [Math]::Min([Math]::Max(0, $x), ($Bitmap.Width - $width))
    $y = [Math]::Min([Math]::Max(0, $y), ($Bitmap.Height - $height))
    return [System.Drawing.Rectangle]::new($x, $y, $width, $height)
}

function Draw-ShotPreviewButton([System.Drawing.Graphics]$Graphics, [System.Drawing.Rectangle]$Bounds,
    [string]$Text, [string]$Kind, [bool]$Hover, [bool]$Pressed, [System.Drawing.Font]$Font, [float]$Scale) {
    # Three roles, one shape: a filled primary, a hairline secondary, and a borderless
    # ghost for the action that leaves everything as it was. Hover and press only
    # change the fill, so the button never moves under the pointer.
    $radius = [int][Math]::Round(9 * $Scale)
    $fill = $null
    $stroke = $null
    $ink = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $muted = [System.Drawing.Color]::FromArgb(110, 118, 130)
    $textColor = $ink
    switch ($Kind) {
        'primary' {
            $fill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(53, 59, 70))
            $textColor = [System.Drawing.Color]::White
            if ($Hover) { $fill.Color = [System.Drawing.Color]::FromArgb(74, 82, 96) }
            if ($Pressed) { $fill.Color = [System.Drawing.Color]::FromArgb(36, 41, 50) }
        }
        'secondary' {
            $fill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
            $stroke = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(215, 220, 228), 1)
            if ($Hover) { $fill.Color = [System.Drawing.Color]::FromArgb(242, 244, 247) }
            if ($Pressed) { $fill.Color = [System.Drawing.Color]::FromArgb(232, 235, 240) }
        }
        default {
            $textColor = $muted
            if ($Hover -or $Pressed) {
                $fill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 244, 247))
                if ($Pressed) { $fill.Color = [System.Drawing.Color]::FromArgb(232, 235, 240) }
                $textColor = $ink
            }
        }
    }
    $path = Get-RoundedPath $Bounds $radius
    $flags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    try {
        if ($null -ne $fill) { $Graphics.FillPath($fill, $path) }
        if ($null -ne $stroke) { $Graphics.DrawPath($stroke, $path) }
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $Text, $Font, $Bounds, $textColor, $flags)
    } finally {
        if ($null -ne $fill) { $fill.Dispose() }
        if ($null -ne $stroke) { $stroke.Dispose() }
        $path.Dispose()
    }
}

function Draw-ShotPreview([System.Drawing.Graphics]$Graphics, $Metrics, $Bitmap, [string]$Path, [int]$Hover, [int]$Pressed,
    [double]$Zoom = 1.0, [System.Drawing.Point]$Offset = [System.Drawing.Point]::Empty) {
    # The whole window in one routine, so the probe draws exactly what a person sees.
    # Hover ids: 0 Save, 1 Copy only, 2 Cancel, 3 close.
    $scale = $Metrics.Scale
    $ink = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $muted = [System.Drawing.Color]::FromArgb(124, 132, 146)
    $hintInk = [System.Drawing.Color]::FromArgb(134, 142, 155)
    $canvas = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $graphics = $Graphics
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $flagsLeft = [System.Windows.Forms.TextFormatFlags]::Left -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::EndEllipsis -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    $flagsRight = [System.Windows.Forms.TextFormatFlags]::Right -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    $resources = New-Object System.Collections.Generic.List[object]
    try {
        $canvasBrush = New-Object System.Drawing.SolidBrush($canvas)
        $resources.Add($canvasBrush)
        $graphics.FillRectangle($canvasBrush, 0, 0, $Metrics.Width, $Metrics.Height)

        $outline = Get-RoundedPath ([System.Drawing.Rectangle]::new(0, 0, ($Metrics.Width - 1), ($Metrics.Height - 1))) ([int][Math]::Round(16 * $scale))
        $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(217, 221, 228), 1)
        $resources.Add($edge)
        try { $graphics.DrawPath($edge, $outline) } finally { $outline.Dispose() }

        $titleFont = Get-QuickAccessFont 11.5 $false
        $resources.Add($titleFont)
        [System.Windows.Forms.TextRenderer]::DrawText($graphics, $SCRIPT:Labels.ShotPreviewTitle, $titleFont,
            $Metrics.TitleRect, $ink, $flagsLeft)
        $hintFont = Get-QuickAccessFont 8 $false
        $resources.Add($hintFont)
        # Two short lines rather than one: the picture's own gestures and the keys
        # that finish the window are different promises, and a single line would run
        # into the title at the smallest width.
        $hintHalf = [int][Math]::Round($Metrics.HintRect.Height / 2.0)
        $hintUpper = [System.Drawing.Rectangle]::new($Metrics.HintRect.Left, $Metrics.HintRect.Top,
            $Metrics.HintRect.Width, $hintHalf)
        $hintLower = [System.Drawing.Rectangle]::new($Metrics.HintRect.Left, ($Metrics.HintRect.Top + $hintHalf),
            $Metrics.HintRect.Width, ($Metrics.HintRect.Height - $hintHalf))
        [System.Windows.Forms.TextRenderer]::DrawText($graphics, $SCRIPT:Labels.ShotPreviewHint, $hintFont,
            $hintUpper, $hintInk, $flagsRight)
        [System.Windows.Forms.TextRenderer]::DrawText($graphics, $SCRIPT:Labels.ShotPreviewKeys, $hintFont,
            $hintLower, $hintInk, $flagsRight)

        # Close: a hairline cross that turns red under the pointer, so the one control
        # that discards the capture reads as the dismissive one.
        $closeHover = ($Hover -eq 3)
        if ($closeHover) {
            $closeFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 244, 247))
            $resources.Add($closeFill)
            $closePath = Get-RoundedPath $Metrics.CloseRect ([int][Math]::Round(8 * $scale))
            try { $graphics.FillPath($closeFill, $closePath) } finally { $closePath.Dispose() }
        }
        $crossColor = if ($closeHover) { [System.Drawing.Color]::FromArgb(196, 78, 78) } else { [System.Drawing.Color]::FromArgb(126, 134, 148) }
        $crossPen = New-Object System.Drawing.Pen($crossColor, [Math]::Max(1.2, 1.35 * $scale))
        $crossPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $crossPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $resources.Add($crossPen)
        $crossX = $Metrics.CloseRect.Left + ($Metrics.CloseRect.Width / 2.0)
        $crossY = $Metrics.CloseRect.Top + ($Metrics.CloseRect.Height / 2.0)
        $crossArm = 4.5 * $scale
        $graphics.DrawLine($crossPen, [float]($crossX - $crossArm), [float]($crossY - $crossArm), [float]($crossX + $crossArm), [float]($crossY + $crossArm))
        $graphics.DrawLine($crossPen, [float]($crossX - $crossArm), [float]($crossY + $crossArm), [float]($crossX + $crossArm), [float]($crossY - $crossArm))

        # The capture sits on a rounded mat rather than straight on the canvas: the
        # mat gives a screenshot of any brightness its own edge.
        $framePath = Get-RoundedPath $Metrics.FrameRect ([int][Math]::Round(12 * $scale))
        $frameFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(238, 241, 245))
        $frameEdge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(216, 221, 229), 1)
        $resources.Add($frameFill)
        $resources.Add($frameEdge)
        try {
            $graphics.FillPath($frameFill, $framePath)
            $graphics.DrawPath($frameEdge, $framePath)
        } finally { $framePath.Dispose() }
        $imagePath = Get-RoundedPath $Metrics.ImageRect ([int][Math]::Round(8 * $scale))
        try {
            $clip = $graphics.Save()
            $graphics.SetClip($imagePath)
            $graphics.DrawImage($Bitmap, (Get-ShotPreviewDrawRect $Metrics $Bitmap $Zoom $Offset))
            $graphics.Restore($clip)
        } finally { $imagePath.Dispose() }

        # Pixel size as a quiet pill, the file it would become underneath, both on the
        # picture's own left edge so the column reads as one block.
        $bodyFont = Get-QuickAccessFont 9 $false
        $resources.Add($bodyFont)
        $crop = Get-ShotPreviewSourceRect $Metrics $Bitmap $Zoom $Offset
        $sizeText = $SCRIPT:Labels.ShotSize -f $Bitmap.Width, $Bitmap.Height
        if ($crop.Width -ne $Bitmap.Width -or $crop.Height -ne $Bitmap.Height) {
            # The pill names what the buttons would write, not the whole capture: once
            # the frame is cropped, the saved picture is that smaller rectangle.
            $base = $Metrics.ImageRect.Width / [double]$Bitmap.Width
            $sizeText = '{0}  {1}%' -f ($SCRIPT:Labels.ShotFrameSize -f $crop.Width, $crop.Height),
                [int][Math]::Round($base * $Zoom * 100)
        }
        $sizeMeasured = [System.Windows.Forms.TextRenderer]::MeasureText($graphics, $sizeText, $bodyFont,
            [System.Drawing.Size]::Empty,
            ([System.Windows.Forms.TextFormatFlags]::SingleLine -bor [System.Windows.Forms.TextFormatFlags]::NoPadding -bor [System.Windows.Forms.TextFormatFlags]::NoPrefix))
        $pillPad = [int][Math]::Round(10 * $scale)
        $pillRect = [System.Drawing.Rectangle]::new($Metrics.SizeRect.Left, $Metrics.SizeRect.Top,
            ($sizeMeasured.Width + ($pillPad * 2)), $Metrics.SizeRect.Height)
        $pillPath = Get-RoundedPath $pillRect ([int][Math]::Round(7 * $scale))
        $pillFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(243, 245, 248))
        $resources.Add($pillFill)
        try { $graphics.FillPath($pillFill, $pillPath) } finally { $pillPath.Dispose() }
        # Measured and drawn with the same flags: the pill is only as wide as the text,
        # and a measurement that leaves out what the drawing adds would clip its tail.
        $pillTextRect = [System.Drawing.Rectangle]::new(($pillRect.Left + $pillPad), $pillRect.Top,
            ($pillRect.Width - $pillPad), $pillRect.Height)
        [System.Windows.Forms.TextRenderer]::DrawText($graphics, $sizeText, $bodyFont, $pillTextRect,
            [System.Drawing.Color]::FromArgb(96, 104, 118),
            ([System.Windows.Forms.TextFormatFlags]::Left -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
                [System.Windows.Forms.TextFormatFlags]::SingleLine -bor [System.Windows.Forms.TextFormatFlags]::NoPrefix -bor
                [System.Windows.Forms.TextFormatFlags]::NoPadding))

        $pathText = $SCRIPT:Labels.ShotTarget -f $Path
        [System.Windows.Forms.TextRenderer]::DrawText($graphics, $pathText, $bodyFont, $Metrics.PathRect,
            $muted, $flagsLeft)

        $buttonFont = Get-QuickAccessFont 9.5 $false
        $resources.Add($buttonFont)
        Draw-ShotPreviewButton $graphics $Metrics.SaveRect $SCRIPT:Labels.ShotSave 'primary' `
            ($Hover -eq 0) ($Pressed -eq 0) $buttonFont $scale
        Draw-ShotPreviewButton $graphics $Metrics.CopyRect $SCRIPT:Labels.ShotCopy 'secondary' `
            ($Hover -eq 1) ($Pressed -eq 1) $buttonFont $scale
        Draw-ShotPreviewButton $graphics $Metrics.CancelRect $SCRIPT:Labels.ShotCancel 'ghost' `
            ($Hover -eq 2) ($Pressed -eq 2) $buttonFont $scale
    } finally {
        foreach ($item in $resources) { $item.Dispose() }
    }
}

# ---- menu commands ----------------------------------------------------------
# Defined here rather than with the rest of the menu because the self test below
# builds the sites entry and fires it, so the whole path that click takes - the
# command file it writes - has to exist by then. Only the window raise in that path
# is stubbed there: it is defined further down and DshPid is 0 in a self test, so it
# would do nothing anyway.
#
# Write the pet's menu choice where the host reads it. The host watches this file
# the way this pet watches the state file, and the timestamp is what tells a fresh
# choice from the one it already forwarded. A number rides along for the volume
# entries, and a chosen picture path for the listening mode; the host checks both
# again before it acts, because this file is a file.
function Send-MenuCommand([string]$Command, $Value = $null) {
    $payload = [ordered]@{
        command = $Command
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    if ($null -ne $Value) { $payload.value = $Value }
    Write-Json $SCRIPT:CommandFile $payload
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

# Rows are laid out by the menu card rather than by their labels: WinForms sizes each
# row to its text and then draws the submenu chevron right after that text, so the
# card ends up wider than its rows (a blank strip on the right) and a label as long
# as the row covers the chevron. Every row of one dropdown is given the same width
# here - the widest label plus the chevron's corner - and the card is pinned to that
# width so it wraps its rows instead of leaving a strip beside them.
function Set-PetMenuRowWidths($Menu, [int]$MinRowWidth = 0, $Font = $null) {
    $rows = @($Menu.Items | Where-Object { $_ -is [System.Windows.Forms.ToolStripMenuItem] })
    if ($rows.Count -eq 0) { return }
    # A submenu inherits the font of the menu it hangs from only once it is shown, so
    # the font is carried down from the strip that has one; measuring with the wrong
    # one sizes a submenu for text that is not the text it draws.
    if ($null -eq $Font) {
        $Font = $Menu.Font
        if ($null -eq $Font -and $null -ne $Menu.OwnerItem) { $Font = $Menu.OwnerItem.Owner.Font }
        if ($null -eq $Font) { $Font = [System.Windows.Forms.Control]::DefaultFont }
    }
    $widest = 0
    $heights = @{}
    foreach ($item in $rows) {
        $preferred = $item.GetPreferredSize([System.Drawing.Size]::Empty)
        $heights[$item] = $preferred.Height
        # Two numbers decide the width: what WinForms needs for the row, and what the
        # renderer's fixed text offset needs. Under display scaling those fixed pixels
        # do not grow with the font, so the measured text has to be consulted too.
        $text = [System.Windows.Forms.TextRenderer]::MeasureText([string]$item.Text, $Font).Width
        if ($preferred.Width -gt $widest) { $widest = $preferred.Width }
        if (46 + $text + 40 -gt $widest) { $widest = 46 + $text + 40 }
    }
    $width = [Math]::Max($MinRowWidth, $widest)
    foreach ($item in $rows) {
        $item.AutoSize = $false
        $item.Size = New-Object System.Drawing.Size($width, $heights[$item])
    }
    # An earlier minimum - the 220 the menu was built with, or the width a longer list
    # needed before this rebuild - only ever grows the card, so it is released first.
    $Menu.MinimumSize = [System.Drawing.Size]::Empty
    $Menu.PerformLayout()
    $Menu.MinimumSize = New-Object System.Drawing.Size(($width + $Menu.Padding.Horizontal), 0)
    $Menu.PerformLayout()
    foreach ($item in $rows) {
        if ($item.HasDropDownItems) { Set-PetMenuRowWidths $item.DropDown 0 $Font }
    }
}

function New-SitesItem($Items) {
    # The library page is the menu's only site entry: the sites themselves live in
    # that page, which is where they are read and changed. Opening it is a
    # DSH-window activity, because the page has to be rendered there, so the pet
    # brings that window forward before it writes the command.
    $item = Add-PetMenuItem $Items $SCRIPT:Labels.Sites 'globe'
    $item.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'favorites'
        } catch { Write-Log $_.Exception.Message }
    })
    return $item
}

function Start-VideoClip {
    # The clip window is a second script rather than a part of this one: it owns a
    # window of its own, a child process, and a log, none of which the pet's own
    # tick should be waiting on. It is started detached, with no console of its
    # own: -WindowStyle Hidden would keep the window the script draws hidden too,
    # because the startup show state is inherited by the first window the child
    # makes. The folder it starts with is the one the settings card configured,
    # when there is one.
    $scriptFile = Join-Path $SCRIPT:ScriptDir 'video-clip.ps1'
    if (-not (Test-Path -LiteralPath $scriptFile -PathType Leaf)) {
        throw $SCRIPT:Labels.VideoClipMissing
    }
    $shell = (Get-Process -Id $PID).Path
    if ([string]::IsNullOrWhiteSpace($shell)) { $shell = 'powershell.exe' }
    $arguments = @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptFile + '"'))
    if (-not [string]::IsNullOrWhiteSpace($SCRIPT:VideoClipDir)) {
        $arguments += '-DefaultDir'
        $arguments += ('"' + $SCRIPT:VideoClipDir + '"')
    }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $shell
    $info.Arguments = ($arguments -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    [void][System.Diagnostics.Process]::Start($info)
}

function Add-MenuLine($Menu, [string]$Text) {
    # A fact, not a choice: shown for reading, never clickable.
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $Text
    $item.Enabled = $false
    $item.AutoSize = $true
    $item.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    [void]$Menu.DropDownItems.Add($item)
    return $item
}

# ---- music ------------------------------------------------------------------
# ---- other audio on this machine ---------------------------------------------
#
# Whether somebody else is playing sound is Windows' answer rather than this
# process's: every application mixing into the default output device owns an audio
# session there, and each session exposes a peak level. The default endpoint is the
# one that matters because WPF's MediaPlayer has no device selection - whatever
# this pet plays is mixed into it - and this process's own session is excluded by
# its process id, so what is left is exactly the audio that would play over the
# music. The C# below is the in-box CoreAudio surface, which PowerShell cannot
# declare by itself, and it is compiled on first use so a pet that never plays
# anything pays nothing for it.

function Initialize-AudioSessions {
    if ('DshPet.AudioSessions' -as [type]) { return $true }
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

namespace DshPet
{
    // The audio sessions of the default output device: their process, their state,
    // and their peak level. Only the members this needs are declared, in vtable
    // order, because COM resolves them by position.
    public static class AudioSessions
    {
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        private class MMDeviceEnumerator
        {
        }

        private enum EDataFlow
        {
            eRender = 0,
            eCapture = 1,
            eAll = 2
        }

        private enum ERole
        {
            eConsole = 0,
            eMultimedia = 1,
            eCommunications = 2
        }

        private enum CLSCTX
        {
            CLSCTX_INPROC_SERVER = 1,
            CLSCTX_INPROC_HANDLER = 2,
            CLSCTX_LOCAL_SERVER = 4,
            CLSCTX_REMOTE_SERVER = 16,
            CLSCTX_ALL = 23
        }

        private enum AudioSessionState
        {
            Inactive = 0,
            Active = 1,
            Expired = 2
        }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            [PreserveSig]
            int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out IntPtr devices);
            [PreserveSig]
            int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
            [PreserveSig]
            int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
            [PreserveSig]
            int RegisterEndpointNotificationCallback(IntPtr client);
            [PreserveSig]
            int UnregisterEndpointNotificationCallback(IntPtr client);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            [PreserveSig]
            int Activate(ref Guid iid, CLSCTX clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
            [PreserveSig]
            int OpenPropertyStore(int stgmAccess, out IntPtr properties);
            [PreserveSig]
            int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
            [PreserveSig]
            int GetState(out int state);
        }

        [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioSessionManager2
        {
            [PreserveSig]
            int GetAudioSessionControl(ref Guid sessionGuid, int streamFlags, out IntPtr sessionControl);
            [PreserveSig]
            int GetSimpleAudioVolume(ref Guid sessionGuid, int streamFlags, out IntPtr audioVolume);
            [PreserveSig]
            int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
            [PreserveSig]
            int RegisterSessionNotification(IntPtr sessionNotification);
            [PreserveSig]
            int UnregisterSessionNotification(IntPtr sessionNotification);
            [PreserveSig]
            int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
            [PreserveSig]
            int UnregisterDuckNotification(IntPtr duckNotification);
        }

        [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioSessionEnumerator
        {
            [PreserveSig]
            int GetCount(out int sessionCount);
            [PreserveSig]
            int GetSession(int sessionIndex, out IAudioSessionControl session);
        }

        [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioSessionControl
        {
            [PreserveSig]
            int GetState(out AudioSessionState state);
            [PreserveSig]
            int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
            [PreserveSig]
            int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
            [PreserveSig]
            int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
            [PreserveSig]
            int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
            [PreserveSig]
            int GetGroupingParam(out Guid groupingParam);
            [PreserveSig]
            int SetGroupingParam(ref Guid groupingParam, ref Guid eventContext);
            [PreserveSig]
            int RegisterAudioSessionNotification(IntPtr client);
            [PreserveSig]
            int UnregisterAudioSessionNotification(IntPtr client);
        }

        [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioSessionControl2
        {
            [PreserveSig]
            int GetState(out AudioSessionState state);
            [PreserveSig]
            int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
            [PreserveSig]
            int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
            [PreserveSig]
            int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
            [PreserveSig]
            int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
            [PreserveSig]
            int GetGroupingParam(out Guid groupingParam);
            [PreserveSig]
            int SetGroupingParam(ref Guid groupingParam, ref Guid eventContext);
            [PreserveSig]
            int RegisterAudioSessionNotification(IntPtr client);
            [PreserveSig]
            int UnregisterAudioSessionNotification(IntPtr client);
            [PreserveSig]
            int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string identifier);
            [PreserveSig]
            int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string identifier);
            [PreserveSig]
            int GetProcessId(out int processId);
            [PreserveSig]
            int IsSystemSoundsSession();
            [PreserveSig]
            int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
        }

        [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioMeterInformation
        {
            [PreserveSig]
            int GetPeakValue(out float peak);
            [PreserveSig]
            int GetMeteringChannelCount(out int channelCount);
            [PreserveSig]
            int GetChannelsPeakValues(int channelCount, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peakValues);
            [PreserveSig]
            int QueryHardwareSupport(out int hardwareSupportMask);
        }

        // One session as the probe prints it: who owns it, whether it is still
        // mixing, how loud it is right now, and whether it is the system-sounds
        // session - which is where notification dings land.
        private sealed class Session
        {
            public int ProcessId;
            public AudioSessionState State;
            public float Peak;
            public bool SystemSounds;
        }

        public static float MaxOtherPeak(int ownPid)
        {
            Session[] sessions = Read(ownPid);
            if (sessions == null) return -1f;
            float loudest = 0f;
            for (int index = 0; index < sessions.Length; index++)
            {
                Session session = sessions[index];
                if (session.ProcessId == ownPid) continue;
                if (session.State == AudioSessionState.Expired) continue;
                if (session.Peak > loudest) loudest = session.Peak;
            }
            return loudest;
        }

        // What this process itself is playing: the peak of the sessions the music
        // owns, which is what the page's listening mode draws its bars from. The
        // same reading the probe prints, without the other applications. The
        // value is not clamped: a session can report above 1, and the page smooths
        // against the loudest recent sample rather than against an absolute scale.
        public static float OwnPeak(int ownPid)
        {
            Session[] sessions = Read(ownPid);
            if (sessions == null) return -1f;
            float loudest = 0f;
            for (int index = 0; index < sessions.Length; index++)
            {
                Session session = sessions[index];
                if (session.ProcessId != ownPid) continue;
                if (session.State == AudioSessionState.Expired) continue;
                if (session.Peak > loudest) loudest = session.Peak;
            }
            return loudest < 0f ? 0f : loudest;
        }

        public static string Describe(int ownPid)
        {
            Session[] sessions = Read(ownPid);
            if (sessions == null) return "unavailable";
            StringBuilder text = new StringBuilder();
            for (int index = 0; index < sessions.Length; index++)
            {
                Session session = sessions[index];
                if (index > 0) text.Append('\n');
                text.Append(session.ProcessId.ToString(CultureInfo.InvariantCulture));
                text.Append('|').Append(session.State.ToString());
                text.Append('|').Append(session.Peak.ToString("0.000", CultureInfo.InvariantCulture));
                text.Append('|').Append(session.ProcessId == ownPid ? "self" : "other");
                if (session.SystemSounds) text.Append("|system-sounds");
                text.Append('|').Append(ProcessName(session.ProcessId));
            }
            return text.ToString();
        }

        private static Session[] Read(int ownPid)
        {
            IMMDeviceEnumerator enumerator = null;
            IMMDevice device = null;
            IAudioSessionManager2 manager = null;
            IAudioSessionEnumerator sessions = null;
            try
            {
                enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
                if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device) != 0) return null;
                Guid iid = typeof(IAudioSessionManager2).GUID;
                object activated = null;
                if (device.Activate(ref iid, CLSCTX.CLSCTX_ALL, IntPtr.Zero, out activated) != 0) return null;
                manager = activated as IAudioSessionManager2;
                if (manager == null) return null;
                if (manager.GetSessionEnumerator(out sessions) != 0) return null;
                int count = 0;
                if (sessions.GetCount(out count) != 0) return null;
                Session[] found = new Session[count];
                int kept = 0;
                for (int index = 0; index < count; index++)
                {
                    IAudioSessionControl control = null;
                    try
                    {
                        if (sessions.GetSession(index, out control) != 0 || control == null) continue;
                        Session session = new Session();
                        session.State = AudioSessionState.Inactive;
                        control.GetState(out session.State);
                        IAudioSessionControl2 details = control as IAudioSessionControl2;
                        if (details != null)
                        {
                            details.GetProcessId(out session.ProcessId);
                            // S_OK is the system-sounds session; S_FALSE is everything else.
                            session.SystemSounds = details.IsSystemSoundsSession() == 0;
                        }
                        IAudioMeterInformation meter = control as IAudioMeterInformation;
                        if (meter != null) meter.GetPeakValue(out session.Peak);
                        found[kept] = session;
                        kept++;
                    }
                    finally
                    {
                        Release(control);
                    }
                }
                if (kept == count) return found;
                Session[] trimmed = new Session[kept];
                Array.Copy(found, trimmed, kept);
                return trimmed;
            }
            catch (Exception)
            {
                // A device that went away between enumeration and read is not a
                // problem the caller can act on; it reads as "cannot say".
                return null;
            }
            finally
            {
                Release(sessions);
                Release(manager);
                Release(device);
                Release(enumerator);
            }
        }

        private static string ProcessName(int processId)
        {
            if (processId <= 0) return "system";
            try
            {
                using (Process process = Process.GetProcessById(processId))
                {
                    return process.ProcessName;
                }
            }
            catch (Exception)
            {
                return "gone";
            }
        }

        private static void Release(object instance)
        {
            if (instance == null) return;
            try
            {
                if (Marshal.IsComObject(instance)) Marshal.ReleaseComObject(instance);
            }
            catch (Exception)
            {
                // Already released, or never a COM object: nothing left to do.
            }
        }
    }
}
'@
        return $true
    } catch {
        Write-Log "audio sessions unavailable: $($_.Exception.Message)"
        return $false
    }
}

# The loudest session that is not this process, or a negative number when Windows
# cannot say. The caller treats that as nobody: a machine without this API plays
# the way it did before the feature existed.
function Get-OtherAudioPeak {
    if (-not (Initialize-AudioSessions)) { return -1 }
    try {
        return [double][DshPet.AudioSessions]::MaxOtherPeak($PID)
    } catch {
        Write-Log "reading other audio failed: $($_.Exception.Message)"
        return -1
    }
}

# What one sample means, given the counters the sample before it left behind. Pure,
# because a decision that can only be observed by playing music beside a video is a
# decision nobody tests: the smoke test drives it directly. It answers only *when*
# to step aside and when to come back; how that is done - a fade or a pause - is the
# caller's business, which is what keeps the two independent of each other. The
# parameter is LoudNow rather than Loud because PowerShell variable names ignore
# case, so a local called loud would be the parameter itself.
function Get-MusicDuckDecision([bool]$Stepped, [bool]$LoudNow, [int]$LoudSamples, [int]$QuietSamples, [int]$HoldSeconds, [int]$SustainSamples) {
    if (-not $Stepped) {
        $heard = 0
        if ($LoudNow) { $heard = $LoudSamples + 1 }
        if ($heard -ge $SustainSamples) { return @{ Action = 'step'; Loud = 0; Quiet = 0 } }
        return @{ Action = 'none'; Loud = $heard; Quiet = 0 }
    }
    $silent = 0
    if (-not $LoudNow) { $silent = $QuietSamples + 1 }
    if ($silent -ge $HoldSeconds) { return @{ Action = 'return'; Loud = 0; Quiet = 0 } }
    return @{ Action = 'none'; Loud = 0; Quiet = $silent }
}

# The next multiplier of one fade step: the distance a step covers is the whole
# fade's share of it, and it stops on the target rather than overshooting. Pure for
# the same reason the decision is: a slope is otherwise only visible by listening.
function Get-MusicDuckGain([double]$Gain, [double]$Target, [double]$StepMs, [double]$FadeMs) {
    $step = $StepMs / $FadeMs
    if ($Gain -lt $Target) { return [Math]::Round([Math]::Min($Target, $Gain + $step), 4) }
    return [Math]::Round([Math]::Max($Target, $Gain - $step), 4)
}

# What the player is told: the volume the settings hold times the fade, as the 0-1
# fraction WPF wants. Pure and clamped with double literals, because PowerShell
# picks Math.Min's overload from the arguments and `[Math]::Min(1, 0.2)` is the
# Int32 one - it truncates a fade to silence instead of to a fifth of the volume.
function Get-MusicOutputVolume([double]$Volume, [double]$Gain) {
    return [Math]::Max(0.0, [Math]::Min(1.0, ($Volume / 100) * $Gain))
}

# What the player is at right now: the volume the settings hold, times the fade.
function Update-MusicOutput {
    if ($null -eq $SCRIPT:Music) { return }
    try { $SCRIPT:Music.Volume = Get-MusicOutputVolume $SCRIPT:MusicVolume $SCRIPT:DuckGain } catch { }
}

# Aim the fade at one multiplier of the configured volume and keep walking toward it
# while the timer runs. The step is applied at once, so a step aside is audible
# within one timer tick rather than after the first interval.
function Set-MusicDuckGain([double]$Target) {
    $SCRIPT:DuckTarget = [Math]::Max(0.0, [Math]::Min(1.0, $Target))
    if ($null -eq $SCRIPT:DuckTimer) {
        $SCRIPT:DuckTimer = New-Object System.Windows.Threading.DispatcherTimer
        $SCRIPT:DuckTimer.Interval = [TimeSpan]::FromMilliseconds($SCRIPT:DuckFadeStepMs)
        $SCRIPT:DuckTimer.Add_Tick({
            try {
                $next = Get-MusicDuckGain $SCRIPT:DuckGain $SCRIPT:DuckTarget $SCRIPT:DuckFadeStepMs $SCRIPT:DuckFadeMs
                if ([Math]::Abs($next - $SCRIPT:DuckGain) -lt 0.0001) { $SCRIPT:DuckTimer.Stop(); return }
                $SCRIPT:DuckGain = $next
                Update-MusicOutput
                Save-MusicPlayerState
                if ([Math]::Abs($next - $SCRIPT:DuckTarget) -lt 0.0001) { $SCRIPT:DuckTimer.Stop() }
            } catch { Write-Log "the music fade failed: $($_.Exception.Message)" }
        })
    }
    if ([Math]::Abs($SCRIPT:DuckGain - $SCRIPT:DuckTarget) -lt 0.0001) {
        $SCRIPT:DuckGain = $SCRIPT:DuckTarget
        Update-MusicOutput
        return
    }
    if (-not $SCRIPT:DuckTimer.IsEnabled) { $SCRIPT:DuckTimer.Start() }
}

# One sample of the probe, once a second while the music matters. Nothing is asked
# of the host and nothing is written except the playback state: this runs inside
# this process, which is the half that owns the audio.
function Update-MusicDuck {
    if (-not ($SCRIPT:MusicPlaying -or $SCRIPT:MusicSteppedAside)) {
        $SCRIPT:DuckLoud = 0
        $SCRIPT:DuckQuiet = 0
        return
    }
    $peak = Get-OtherAudioPeak
    if ($peak -lt 0) { return }
    $decision = Get-MusicDuckDecision $SCRIPT:MusicSteppedAside ($peak -gt $SCRIPT:DuckPeak) $SCRIPT:DuckLoud $SCRIPT:DuckQuiet $SCRIPT:MusicDuckHoldSeconds $SCRIPT:DuckSustainSamples
    $SCRIPT:DuckLoud = [int]$decision.Loud
    $SCRIPT:DuckQuiet = [int]$decision.Quiet
    if ($decision.Action -eq 'step') { Step-MusicAside }
    elseif ($decision.Action -eq 'return') { Return-MusicFromAside }
}

# Step aside for another application, the way the configuration asks: a fade to the
# configured level, or a pause where we are. MusicSteppedAside is what marks it as
# this process's own doing, so the return may undo it and nothing else may.
function Step-MusicAside {
    if ($SCRIPT:MusicSteppedAside) { return }
    $SCRIPT:MusicSteppedAside = $true
    if ($SCRIPT:MusicDuckMode -eq 'pause') {
        if ($null -ne $SCRIPT:Music) { try { $SCRIPT:Music.Pause() } catch { } }
        $SCRIPT:MusicPlaying = $false
    } else {
        Set-MusicDuckGain ($SCRIPT:MusicDuckLevel / 100)
    }
    Save-MusicPlayerState
}

# Come back once the other application has been quiet for the configured stretch. A
# pause the person asked for is never resumed by this: it is what MusicSteppedAside
# distinguishes.
function Return-MusicFromAside {
    if (-not $SCRIPT:MusicSteppedAside) { return }
    $SCRIPT:MusicSteppedAside = $false
    if ($SCRIPT:MusicDuckMode -eq 'pause') { Start-MusicPlayback }
    else { Set-MusicDuckGain 1 }
    Save-MusicPlayerState
}

# Take the music back at once, for something the person asked for: the fade goes
# back up and the step-aside mark goes with it, so the probe does not come along
# afterwards and undo what was just asked for.
function Clear-MusicStepAside {
    if ($SCRIPT:MusicSteppedAside) { $SCRIPT:MusicSteppedAside = $false }
    if ($SCRIPT:DuckGain -lt 1) { Set-MusicDuckGain 1 }
}

# The audio is a WPF MediaPlayer: one instance owned by this process, opened on a
# track the host published, told the volume the settings card holds. Nothing here
# decodes anything by itself - the streams the host downloads are AAC in an MP4 box
# and Windows decodes them - so the only failure this half can meet is the player's
# own, which arrives as MediaFailed for the track and is reported in the menu.

function Get-MusicPlayer {
    # Built on first use rather than at startup: a machine with no track downloaded
    # yet never creates one, and a machine with no sound device still opens the menu
    # and the settings.
    if ($null -eq $SCRIPT:Music) {
        $player = New-Object System.Windows.Media.MediaPlayer
        $player.add_MediaOpened({
            param($sender, $eventArgs)
            try {
                # Which open this is, recorded before anything that can fail: MediaPlayer
                # reports the media it replaced as having ended, without an open of its
                # own, so only a track that really opened may advance the list when it
                # ends (see Test-MusicEndedAdvance).
                $SCRIPT:MusicOpenGeneration = $SCRIPT:MusicGeneration
                if ($SCRIPT:MusicResumeMs -gt 0) {
                    $sender.Position = [TimeSpan]::FromMilliseconds([double]$SCRIPT:MusicResumeMs)
                    $SCRIPT:MusicResumeMs = 0
                }
                $SCRIPT:MusicOpened = $true
                $SCRIPT:MusicError = ''
                # Stored again now that the position can be read: the resume it was
                # opened with is a fact about this track, and a start that ended right
                # here must not come back at the top of the file.
                Save-MusicPlayerState
            } catch { Write-Log "applying the resume position failed: $($_.Exception.Message)" }
        })
        $player.add_MediaEnded({
            try {
                if (Test-MusicEndedAdvance) { Step-MusicTrack 1 $true }
            } catch { Write-Log "advancing past a finished track failed: $($_.Exception.Message)" }
        })
        $player.add_MediaFailed({
            param($sender, $eventArgs)
            try {
                $SCRIPT:MusicPlaying = $false
                $SCRIPT:MusicOpened = $false
                $SCRIPT:MusicError = [string]$eventArgs.ErrorException.Message
                Save-MusicPlayerState
            } catch { Write-Log "reporting a playback failure failed: $($_.Exception.Message)" }
        })
        $SCRIPT:Music = $player
    }
    return $SCRIPT:Music
}

function Set-MusicVolume([double]$Percent) {
    $value = [Math]::Min(100, [Math]::Max(0, $Percent))
    $SCRIPT:MusicVolume = $value
    # What the player is told is this volume times the fade, so a volume change
    # during a fade keeps the slope rather than jumping out of it.
    Update-MusicOutput
}

function Get-MusicTitle {
    if ($SCRIPT:MusicIndex -lt 0 -or $SCRIPT:MusicIndex -ge $SCRIPT:MusicTracks.Count) { return '' }
    return [string]$SCRIPT:MusicTracks[$SCRIPT:MusicIndex].Title
}

# Whether the media that just ended is the one that opened: Open() reports the media
# it replaced as having ended, without an open of its own, so a track opened while
# paused must not be treated as a finished one - that would skip a song and start
# playing something nobody asked for. See Get-MusicPlayer for both generations.
function Test-MusicEndedAdvance {
    return ($SCRIPT:MusicTracks.Count -gt 0 -and $SCRIPT:MusicOpenGeneration -eq $SCRIPT:MusicGeneration)
}

# What this process is playing, in the file the host reads for the settings card and
# this process reads back at the next start. The command and notice timestamps ride
# along so a restart neither replays the last command from the page nor shows the
# same toast twice.
function Save-MusicPlayerState {
    $position = 0
    if ($null -ne $SCRIPT:Music) {
        try { $position = [long][Math]::Max(0, $SCRIPT:Music.Position.TotalMilliseconds) } catch { }
    }
    Write-Json $SCRIPT:MusicPlayerFile ([ordered]@{
        playing    = [bool]$SCRIPT:MusicPlaying
        ducked     = [bool]$SCRIPT:MusicSteppedAside
        # How it stepped aside, and what it is playing at right now: the card says
        # which of the two happened, and the volume is the fade's own report - the
        # only way a slope can be seen from outside this process. One decimal,
        # because a machine listening at 4% would otherwise show a fade as 4, 3, 2.
        duckedMode = [string]$SCRIPT:MusicDuckMode
        volume     = [double][Math]::Round($SCRIPT:MusicVolume * $SCRIPT:DuckGain, 1)
        id         = [string]$SCRIPT:MusicCurrentId
        title      = (Get-MusicTitle)
        positionMs = $position
        error      = [string]$SCRIPT:MusicError
        commandAt  = [long]$SCRIPT:MusicCommandAt
        noticeAt   = [long]$SCRIPT:MusicNoticeAt
        updatedAt  = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    })
}

function Restore-MusicPlayerState {
    $saved = Read-Json $SCRIPT:MusicPlayerFile
    if ($null -eq $saved) { return }
    if ($null -ne $saved.commandAt) { $SCRIPT:MusicCommandAt = [long]$saved.commandAt }
    if ($null -ne $saved.noticeAt) { $SCRIPT:MusicNoticeAt = [long]$saved.noticeAt }
    $SCRIPT:MusicSavedId = [string]$saved.id
    if ($null -ne $saved.positionMs) { $SCRIPT:MusicSavedPositionMs = [long]$saved.positionMs }
    $SCRIPT:MusicSavedPlaying = [bool]$saved.playing
    # Whether that track is still in the library is the host's answer, so the wish
    # waits until the first library arrives rather than being acted on here.
    $SCRIPT:MusicRestore = -not [string]::IsNullOrWhiteSpace($SCRIPT:MusicSavedId)
}

function Open-MusicTrack([int]$Index, [bool]$Play, [long]$PositionMs = 0) {
    if ($Index -lt 0 -or $Index -ge $SCRIPT:MusicTracks.Count) { return }
    $track = $SCRIPT:MusicTracks[$Index]
    $SCRIPT:MusicIndex = $Index
    $SCRIPT:MusicCurrentId = [string]$track.Id
    $SCRIPT:MusicCurrentFile = [string]$track.File
    $SCRIPT:MusicResumeMs = $PositionMs
    $SCRIPT:MusicError = ''
    $SCRIPT:MusicOpened = $false
    $SCRIPT:MusicPlaying = $false
    $SCRIPT:MusicStarted = $Play
    $SCRIPT:MusicGeneration++
    try {
        $player = Get-MusicPlayer
        $player.Open([Uri]::new([string]$track.File))
        Set-MusicVolume $SCRIPT:MusicVolume
        if ($Play) {
            # Playing before the stream is open is what the media player supports: it
            # starts as soon as the file is, and the position is applied at
            # MediaOpened, which is the first moment it can be.
            $player.Play()
            $SCRIPT:MusicPlaying = $true
        }
    } catch {
        $SCRIPT:MusicError = $_.Exception.Message
        $SCRIPT:MusicPlaying = $false
    }
    Save-MusicPlayerState
}

# The index one step lands on. Shuffled, it is drawn rather than stepped to and never
# the one already playing, so a press always changes the song; otherwise it walks the
# list in the direction pressed, wrapping at either end.
function Get-StepMusicIndex([int]$Delta) {
    $count = $SCRIPT:MusicTracks.Count
    if ($count -eq 0) { return -1 }
    $index = $SCRIPT:MusicIndex
    if ($SCRIPT:MusicShuffle -and $count -gt 1) {
        $current = $index
        do { $index = Get-Random -Minimum 0 -Maximum $count } while ($index -eq $current)
        return $index
    }
    if ($index -lt 0) { return $(if ($Delta -ge 0) { 0 } else { $count - 1 }) }
    return (((($index + $Delta) % $count) + $count) % $count)
}

function Step-MusicTrack([int]$Delta, [bool]$Play) {
    $index = Get-StepMusicIndex $Delta
    if ($index -lt 0) { return }
    # Asking for another song is asking to listen: whatever another application is
    # doing, this is not the step aside any more (see Clear-MusicStepAside).
    Clear-MusicStepAside
    Open-MusicTrack $index $Play 0
}

# Start, or continue, playback where it was left: shared by the person's own play
# command and the resume that follows another application going quiet.
function Start-MusicPlayback {
    if ($SCRIPT:MusicPlaying) { return }
    if ($SCRIPT:MusicTracks.Count -eq 0) { return }
    # A track that is still open is picked up where it stopped; one the host no
    # longer publishes, or whose file moved, is opened again from the top.
    $same = $SCRIPT:MusicIndex -ge 0 -and $SCRIPT:MusicIndex -lt $SCRIPT:MusicTracks.Count `
        -and [string]$SCRIPT:MusicTracks[$SCRIPT:MusicIndex].File -eq $SCRIPT:MusicCurrentFile
    if (-not $same) { Step-MusicTrack 1 $true; return }
    $player = Get-MusicPlayer
    try {
        $player.Play()
        $SCRIPT:MusicPlaying = $true
        $SCRIPT:MusicError = ''
    } catch { $SCRIPT:MusicError = $_.Exception.Message }
    Save-MusicPlayerState
}

function Toggle-MusicPlay {
    if ($SCRIPT:MusicPlaying) {
        if ($null -ne $SCRIPT:Music) { try { $SCRIPT:Music.Pause() } catch { } }
        $SCRIPT:MusicPlaying = $false
        # A pause the person asked for is nobody else's to undo, and its volume is
        # the volume the settings card holds.
        Clear-MusicStepAside
        Save-MusicPlayerState
        return
    }
    Clear-MusicStepAside
    Start-MusicPlayback
}

function Stop-MusicPlayback {
    # Pause rather than Stop: WPF reports a Stop as the media having ended, which
    # would send this process looking for the next track of an empty library.
    if ($null -ne $SCRIPT:Music) { try { $SCRIPT:Music.Pause() } catch { } }
    $SCRIPT:MusicIndex = -1
    $SCRIPT:MusicCurrentId = ''
    $SCRIPT:MusicCurrentFile = ''
    $SCRIPT:MusicPlaying = $false
    $SCRIPT:MusicStarted = $false
    Clear-MusicStepAside
    Save-MusicPlayerState
}

function Apply-MusicLibrary {
    # The host publishes only the tracks whose files it has, so this list is what may
    # be played. Holding on to the current track by id is what lets a download finish
    # or a volume change reach this process without interrupting the music.
    if ($SCRIPT:MusicTracks.Count -eq 0) {
        if ($SCRIPT:MusicIndex -ge 0 -or $SCRIPT:MusicPlaying) { Stop-MusicPlayback }
        return
    }
    $index = -1
    for ($i = 0; $i -lt $SCRIPT:MusicTracks.Count; $i++) {
        if ($SCRIPT:MusicCurrentId -ne '' -and [string]$SCRIPT:MusicTracks[$i].Id -eq $SCRIPT:MusicCurrentId) { $index = $i; break }
    }
    if ($index -ge 0 -and [string]$SCRIPT:MusicTracks[$index].File -eq $SCRIPT:MusicCurrentFile) {
        $SCRIPT:MusicIndex = $index
        return
    }
    $position = 0
    $play = $false
    if ($SCRIPT:MusicRestore) {
        for ($i = 0; $i -lt $SCRIPT:MusicTracks.Count; $i++) {
            if ([string]$SCRIPT:MusicTracks[$i].Id -eq $SCRIPT:MusicSavedId) {
                $index = $i
                $position = $SCRIPT:MusicSavedPositionMs
                $play = $SCRIPT:MusicSavedPlaying
                break
            }
        }
        $SCRIPT:MusicRestore = $false
    }
    if ($index -lt 0) {
        # The track that was loaded is gone: carry on from the same place in the list,
        # playing if it was playing, and otherwise wait to be asked.
        $index = [Math]::Min([Math]::Max($SCRIPT:MusicIndex, 0), $SCRIPT:MusicTracks.Count - 1)
        $position = 0
        $play = $SCRIPT:MusicPlaying
    }
    Open-MusicTrack $index $play $position
}

function Read-MusicLibrary {
    $data = Read-Json $SCRIPT:MusicFile
    if ($null -eq $data) { return $false }
    $tracks = @()
    foreach ($track in @($data.tracks)) {
        if ($null -eq $track) { continue }
        $file = [string]$track.file
        if ([string]::IsNullOrWhiteSpace($file)) { continue }
        $tracks += [pscustomobject]@{ Id = [string]$track.id; Title = [string]$track.title; File = $file }
    }
    $SCRIPT:MusicLibrary = $data
    $SCRIPT:MusicTracks = $tracks
    $SCRIPT:MusicDir = [string]$data.dir
    $SCRIPT:MusicShuffle = $data.shuffle -eq $true
    # Whether this process steps aside for another player, and how, is configuration:
    # it arrives with the library and applies at once; a host that predates a field
    # leaves the default in force. Every number is parsed rather than cast, because
    # this file is written by another process: a field that arrives empty would
    # otherwise read as a zero, and a fade level of zero is a step aside nobody
    # asked for. A fade that was in progress while the mode changed is taken back up,
    # so no setting leaves the music quiet by itself.
    if ($null -ne $data.duck) { $SCRIPT:MusicDuck = $data.duck -eq $true }
    $holdSeconds = 0
    if ([int]::TryParse([string]$data.duckHoldSeconds, [ref]$holdSeconds)) {
        $SCRIPT:MusicDuckHoldSeconds = [Math]::Max(0, $holdSeconds)
    }
    if ([string]$data.duckMode -eq 'pause') { $SCRIPT:MusicDuckMode = 'pause' }
    elseif ([string]$data.duckMode -eq 'fade') { $SCRIPT:MusicDuckMode = 'fade' }
    $level = 0
    if ([int]::TryParse([string]$data.duckLevel, [ref]$level)) {
        $SCRIPT:MusicDuckLevel = [Math]::Max(0, [Math]::Min(100, $level))
    }
    if (-not $SCRIPT:MusicSteppedAside -and $SCRIPT:DuckGain -lt 1) { Set-MusicDuckGain 1 }
    $SCRIPT:MusicMissing = 0
    if ($null -ne $data.missing) { $SCRIPT:MusicMissing = [int]$data.missing }
    $SCRIPT:MusicSync = $data.sync
    if ($null -ne $data.stageBackground) { $SCRIPT:StageImage = [string]$data.stageBackground }
    if ($null -ne $data.volume) { Set-MusicVolume ([double]$data.volume) }
    return $true
}

function Apply-MusicCommand($data) {
    # What the settings card asked for, which is the one path that reaches the audio
    # from the page: the page cannot play a file, and this process cannot be clicked
    # through from there.
    if ($null -eq $data -or $null -eq $data.command) { return }
    $at = [long]$data.command.at
    if ($at -le $SCRIPT:MusicCommandAt) { return }
    $SCRIPT:MusicCommandAt = $at
    switch ([string]$data.command.action) {
        'play' { if (-not $SCRIPT:MusicPlaying) { Toggle-MusicPlay } }
        'pause' { if ($SCRIPT:MusicPlaying) { Toggle-MusicPlay } }
        'toggle' { Toggle-MusicPlay }
        'next' { Step-MusicTrack 1 $true }
        'prev' { Step-MusicTrack -1 $true }
        # The page's listening mode is what wants the level, so it is what asks
        # for the meter: the two turn on with the mode and off with it.
        'meter-on' { Start-MusicMeter }
        'meter-off' { Stop-MusicMeter }
        default { }
    }
    Save-MusicPlayerState
}

function Apply-MusicNotice($data) {
    # What a download did, said above the pet: the request came from this menu or from
    # the settings card, and a request that ends silently reads as one that did nothing.
    if ($null -eq $data -or $null -eq $data.notice -or $null -eq $data.notice.at) { return }
    $at = [long]$data.notice.at
    if ($at -le $SCRIPT:MusicNoticeAt) { return }
    $SCRIPT:MusicNoticeAt = $at
    $text = ''
    switch ([string]$data.notice.kind) {
        'synced' { $text = $SCRIPT:Labels.MusicSynced -f [int]$data.notice.added, [int]$data.notice.failed }
        'refused' { $text = $SCRIPT:Labels.MusicSyncRunning }
        'no-dir' { $text = $SCRIPT:Labels.MusicOpenFailed }
        'volume' { $text = $SCRIPT:Labels.MusicVolumeSet -f [int]$data.notice.percent }
        'added' { $text = $SCRIPT:Labels.MusicAdded -f [string]$data.notice.title }
        'added-many' { $text = $SCRIPT:Labels.MusicAddedMany -f [int]$data.notice.count }
        'duplicate' { $text = $SCRIPT:Labels.MusicDuplicate }
        'add-failed' { $text = $SCRIPT:Labels.MusicAddFailed -f [string]$data.notice.reason }
        default { }
    }
    Save-MusicPlayerState
    if ($text -ne '') { Show-PetNotice $SCRIPT:Labels.Music $text }
}

function Get-MusicStatusText {
    # The grey line at the top of the submenu: what is playing, or why nothing is.
    if ($SCRIPT:MusicError -ne '') { return ($SCRIPT:Labels.MusicFailed -f $SCRIPT:MusicError) }
    $title = Get-MusicTitle
    if ($title -eq '') {
        if ($SCRIPT:MusicMissing -gt 0) { return ($SCRIPT:Labels.MusicMissing -f $SCRIPT:MusicMissing) }
        return $SCRIPT:Labels.MusicEmpty
    }
    if ($SCRIPT:MusicPlaying) { return ($SCRIPT:Labels.MusicNowPlaying -f $title) }
    if ($SCRIPT:MusicSteppedAside) {
        # Which sentence fits is what the step aside actually did: a fade that is
        # still audible reads as lowered, and a pause reads as paused.
        if ($SCRIPT:MusicDuckMode -eq 'pause') { return ($SCRIPT:Labels.MusicDucked -f $title) }
        return ($SCRIPT:Labels.MusicDuckedFade -f $title)
    }
    if ($SCRIPT:MusicStarted) { return ($SCRIPT:Labels.MusicPaused -f $title) }
    return ($SCRIPT:Labels.MusicReady -f $title)
}

# The link a person is adding lives on the settings card, not in this menu: the card
# owns the link list, and a context menu is no place for a text field.

function Send-MusicVolume([int]$Percent) {
    # Clamped here as well as on the host: this half applies it to the running player
    # at once, so an out-of-range request would be audible before the host could
    # refuse it. The host writes the same number into the configuration, which is
    # what makes it survive the next start.
    $value = [Math]::Max(0, [Math]::Min(100, $Percent))
    Set-MusicVolume $value
    Send-MenuCommand 'music-volume' -Value $value
}

# A drag fires a value change per step, and this half makes each one audible at once;
# the configuration is written once, after the drag settles. The main timer calls
# this, so a slider the person is still holding writes nothing yet.
function Update-MusicVolumeCommit {
    if ($null -eq $SCRIPT:MusicVolumePending) { return }
    if ([Environment]::TickCount -lt $SCRIPT:MusicVolumeDueAt) { return }
    $value = [int]$SCRIPT:MusicVolumePending
    $SCRIPT:MusicVolumePending = $null
    Send-MenuCommand 'music-volume' -Value $value
}

# The volume row: a track bar with the number beside it, hosted in the submenu. A
# context menu draws its own item text and keeps no room for a slider, so the row is
# a control rather than an item - and it is rebuilt at every open like the rest, which
# is also what makes an edit elsewhere reach a running pet.
function New-MusicVolumeRow([int]$Percent) {
    # The card the renderer paints, so the hosted row sits on the same surface.
    $canvas = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $ink = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $panel = New-Object System.Windows.Forms.Panel
    $panel.Width = 190
    $panel.Height = 30
    $panel.BackColor = $canvas
    $label = New-Object System.Windows.Forms.Label
    $label.Text = "$Percent%"
    $label.Width = 44
    $label.Height = 30
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
    $label.ForeColor = $ink
    $label.BackColor = [System.Drawing.Color]::Transparent
    $slider = New-Object System.Windows.Forms.TrackBar
    $slider.Minimum = 0
    $slider.Maximum = 100
    # Ticks on the presets below it: ten of them read as a scale nobody asked for.
    $slider.TickFrequency = 25
    $slider.SmallChange = 5
    $slider.LargeChange = 10
    $slider.Value = [Math]::Max(0, [Math]::Min(100, $Percent))
    $slider.Width = 140
    $slider.Height = 30
    $slider.Location = New-Object System.Drawing.Point(46, 0)
    $slider.BackColor = $canvas
    $panel.Controls.Add($label)
    $panel.Controls.Add($slider)
    $SCRIPT:MusicVolumeSlider = $slider
    $SCRIPT:MusicVolumeLabel = $label
    # Wired after the value is in place, so building the row writes nothing.
    $slider.add_ValueChanged({
            try {
                $value = [int]$SCRIPT:MusicVolumeSlider.Value
                Set-MusicVolume $value
                if ($null -ne $SCRIPT:MusicVolumeLabel) { $SCRIPT:MusicVolumeLabel.Text = "$value%" }
                $SCRIPT:MusicVolumePending = $value
                $SCRIPT:MusicVolumeDueAt = [Environment]::TickCount + 400
            } catch { Write-Log $_.Exception.Message }
        })
    return $panel
}

# Move the slider from a pinned menu handler. A `GetNewClosure` script block runs in a
# scope of its own, where `$SCRIPT:` names nothing this pet set, so those handlers call
# this function with their number instead of touching the control themselves.
function Set-MusicVolumeFromSlider([int]$Percent) {
    $value = [Math]::Max(0, [Math]::Min(100, $Percent))
    if ($null -eq $SCRIPT:MusicVolumeSlider) { Send-MusicVolume $value; return }
    $SCRIPT:MusicVolumeSlider.Value = $value
}

function Add-MusicItem($Menu, [string]$Text, [string]$Icon, [bool]$Enabled, $OnClick) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $Text
    $item.Tag = $Icon
    $item.Enabled = $Enabled
    $item.AutoSize = $true
    $item.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    if ($null -ne $OnClick) { $item.add_Click($OnClick) }
    [void]$Menu.DropDownItems.Add($item)
    return $item
}

# ---- the mode's picture ------------------------------------------------------
# The listening mode draws a picture behind the track, and this menu is where a person
# chooses it: the file is on this machine, and a page can be handed a file's bytes but
# not its path, while the host serves the path it is given. An empty choice is the
# desktop wallpaper the mode has always drawn.

# The picture types the host serves; a file outside this list would answer 404 and
# leave the mode on its own gradient, so it is refused here instead.
$SCRIPT:StageBackgroundTypes = @('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp')

# A modal picker opened from the middle of a menu's own dismissal leaves the strip half
# closed, so the click queues the work for the next dispatcher turn instead - the way
# the quick access tile menu defers its folder picker.
function Invoke-AfterMenu([scriptblock]$Work) {
    $target = $window
    if ($null -ne $target -and $target.Dispatcher.CheckAccess()) {
        try {
            [void]$target.Dispatcher.BeginInvoke([System.Action]$Work)
            return
        } catch {
            Write-Log "queueing a menu action failed: $($_.Exception.Message)"
        }
    }
    & $Work
}

function Select-StageBackground {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = $SCRIPT:Labels.StageImageTitle
        $dialog.Filter = $SCRIPT:Labels.StageImageFilter
        $dialog.CheckFileExists = $true
        $current = [string]$SCRIPT:StageImage
        if (-not [string]::IsNullOrWhiteSpace($current)) {
            try {
                $dir = [System.IO.Path]::GetDirectoryName($current)
                if (-not [string]::IsNullOrWhiteSpace($dir) -and (Test-Path -LiteralPath $dir)) { $dialog.InitialDirectory = $dir }
            } catch { }
        }
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $path = [string]$dialog.FileName
        if ($path -eq '') { return }
        $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
        if ($SCRIPT:StageBackgroundTypes -notcontains $ext) {
            Show-PetNotice $SCRIPT:Labels.Music $SCRIPT:Labels.StageImageUnsupported
            return
        }
        Send-MenuCommand 'stage-background' -Value $path
    } catch {
        Write-Log "choosing a listening-mode background failed: $($_.Exception.Message)"
        try { Show-PetNotice $SCRIPT:Labels.Music $SCRIPT:Labels.StageImageFailed } catch { }
    } finally {
        try { $dialog.Dispose() } catch { }
    }
}

function Clear-StageBackground {
    # Empty is what the host reads as "use the desktop wallpaper again".
    Send-MenuCommand 'stage-background' -Value ''
}

function Update-MusicMenu {
    # Rebuilt whole at every open: the tracks, the volume, and a download's progress
    # all move while it is closed, and reading the library here is also what makes an
    # edit in the settings card reach a pet that is already running.
    if ($null -eq $SCRIPT:MusicMenu) { return }
    if (Read-MusicLibrary) {
        Apply-MusicLibrary
        Apply-MusicNotice $SCRIPT:MusicLibrary
    }
    while ($SCRIPT:MusicMenu.DropDownItems.Count -gt 0) {
        $stale = $SCRIPT:MusicMenu.DropDownItems[0]
        $SCRIPT:MusicMenu.DropDownItems.RemoveAt(0)
        $stale.Dispose()
    }
    [void](Add-MenuLine $SCRIPT:MusicMenu (Get-MusicStatusText))
    $syncing = $null -ne $SCRIPT:MusicSync -and [bool]$SCRIPT:MusicSync.running
    $canPlay = $SCRIPT:MusicTracks.Count -gt 0
    if ($canPlay) {
        [void](Add-MusicItem $SCRIPT:MusicMenu ($(if ($SCRIPT:MusicPlaying) { $SCRIPT:Labels.MusicPause } else { $SCRIPT:Labels.MusicPlay })) `
            $(if ($SCRIPT:MusicPlaying) { 'pause' } else { 'play' }) $true {
                try { Toggle-MusicPlay } catch { Write-Log $_.Exception.Message }
            })
        [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicNext 'next' $true {
            try { Step-MusicTrack 1 $true } catch { Write-Log $_.Exception.Message }
        })
        [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicPrev 'prev' $true {
            try { Step-MusicTrack -1 $true } catch { Write-Log $_.Exception.Message }
        })
    } else {
        [void](Add-MenuLine $SCRIPT:MusicMenu $SCRIPT:Labels.MusicEmptyHint)
    }
    # Volume and adding a link live here rather than only on the settings page: both
    # are what a person reaches for while listening, and neither needs a page. A
    # context menu hosts no slider worth trusting, so the parent line names the volume
    # in force and the presets below it set one.
    $volume = [int][Math]::Round($SCRIPT:MusicVolume)
    $volumeItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $volumeItem.Text = $SCRIPT:Labels.MusicVolume -f $volume
    $volumeItem.Tag = 'music'
    $volumeItem.AutoSize = $true
    $volumeItem.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    $volumeHost = New-Object System.Windows.Forms.ToolStripControlHost((New-MusicVolumeRow $volume))
    $volumeHost.AutoSize = $false
    $volumeHost.Size = New-Object System.Drawing.Size(190, 34)
    [void]$volumeItem.DropDownItems.Add($volumeHost)
    [void]$volumeItem.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    foreach ($preset in @(0, 25, 50, 75, 100)) {
        # A preset moves the slider rather than sending its own command: the slider's
        # handler is what applies the volume and books the configuration write, so both
        # routes behave the same. GetNewClosure pins this row's own number into its
        # handler, because a script block reads its variables from the scope in force
        # when it runs, not the one that made it.
        $percent = [int]$preset
        $presetClick = { try { Set-MusicVolumeFromSlider $percent } catch { Write-Log $_.Exception.Message } }.GetNewClosure()
        [void](Add-MusicItem $volumeItem "$percent%" 'music' $true $presetClick)
    }
    [void]$SCRIPT:MusicMenu.DropDownItems.Add($volumeItem)
    [void]$SCRIPT:MusicMenu.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    if ($syncing) {
        $progress = $SCRIPT:Labels.MusicSyncing -f [int]$SCRIPT:MusicSync.done, [int]$SCRIPT:MusicSync.total
        [void](Add-MusicItem $SCRIPT:MusicMenu $progress 'music' $false $null)
    } elseif ($SCRIPT:MusicMissing -gt 0) {
        [void](Add-MusicItem $SCRIPT:MusicMenu ($SCRIPT:Labels.MusicSyncCount -f $SCRIPT:MusicMissing) 'music' $true {
            try { Send-MenuCommand 'music-sync' } catch { Write-Log $_.Exception.Message }
        })
    } else {
        [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicSyncNone 'music' $false $null)
    }
    [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicOpenDir 'folder' $true {
        try { Send-MenuCommand 'music-open-dir' } catch { Write-Log $_.Exception.Message }
    })
    # The mode's entries come after the transport and the library rows: while
    # listening, the rows a person reaches for are play, next, and the volume, so
    # the surface that swaps the whole window for a picture sits under them.
    if ($canPlay) {
        [void]$SCRIPT:MusicMenu.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        # The mode is a surface of the page rather than a window of this process:
        # the menu only names it, and the page - which owns the DSH window -
        # draws it. DSH has to be on screen first, because a mode in a hidden
        # window is a mode nobody sees.
        [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicStage 'stage' $true {
            try {
                Show-DshWindow
                Send-MenuCommand 'listening-mode'
            } catch {
                Write-Log "opening the listening mode failed: $($_.Exception.Message)"
                try { Show-PetNotice $SCRIPT:Labels.Music $SCRIPT:Labels.MusicStageFailed } catch { }
            }
        })
        # The picture behind that mode: chosen here because a file dialog is this
        # process's to show, and stored by the host, which is what serves it to the page.
        [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.StageImage 'image' $true {
            try { Invoke-AfterMenu { Select-StageBackground } } catch { Write-Log $_.Exception.Message }
        })
        if (-not [string]::IsNullOrWhiteSpace([string]$SCRIPT:StageImage)) {
            [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.StageImageClear 'stage' $true {
                try { Clear-StageBackground } catch { Write-Log $_.Exception.Message }
            })
        }
    }
    # The volume, the links, and the music directory belong to the settings card, so
    # the way to them is the same page entry the main menu's own Settings opens.
    [void](Add-MusicItem $SCRIPT:MusicMenu $SCRIPT:Labels.MusicSettings 'gear' $true {
        try {
            Show-DshWindow
            Send-MenuCommand 'settings'
        } catch { Write-Log $_.Exception.Message }
    })
    Set-PetMenuRowWidths $SCRIPT:MusicMenu.DropDown
}

# ---- listening meter --------------------------------------------------------
# The page's listening mode draws a ring of bars around the track,
# and the level behind it has to come from here: the page cannot see another
# process's audio, and WPF's MediaPlayer exposes no samples. So this half reads
# its own session on the default output device - the CoreAudio surface the
# step-aside feature already uses - and publishes the peak with the track and
# the position in music-level.json, which the host relays to the page while the
# mode is open. The meter runs only after the page asks for it (`meter-on`) and
# stops on `meter-off`, so a pet nobody is looking at writes nothing.

$SCRIPT:MeterWanted = $false
$SCRIPT:MeterTimer = $null

function Get-MusicLevelFile {
    return (Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'music-level.json')
}

# The track's own name and artist, out of the title the host publishes: a
# playlist entry is named "<playlist> - <number>. <song> - <artist>", and all
# three parts on one line is not a title to draw across a wall.
function Format-ListeningTrack([string]$Title) {
    $text = ([string]$Title).Trim()
    if ($text -eq '') { return [pscustomobject]@{ Title = ''; Artist = '' } }
    $cut = $text.IndexOf(' - ', [System.StringComparison]::Ordinal)
    if ($cut -gt 0) { $text = $text.Substring($cut + 3).Trim() }
    $text = [regex]::Replace($text, '^\d+\.\s*', '')
    $parts = [regex]::Split($text, '\s+-\s+', 2)
    $song = $parts[0].Trim()
    $artist = if ($parts.Length -gt 1) { $parts[1].Trim() } else { '' }
    return [pscustomobject]@{ Title = $song; Artist = $artist }
}

function Get-MusicPosition {
    $position = 0.0
    $duration = 0.0
    if ($null -ne $SCRIPT:Music) {
        try { $position = [double]$SCRIPT:Music.Position.TotalMilliseconds } catch { }
        try {
            if ($SCRIPT:Music.NaturalDuration.HasTimeSpan) { $duration = [double]$SCRIPT:Music.NaturalDuration.TimeSpan.TotalMilliseconds }
        } catch { }
    }
    return [pscustomobject]@{ Position = $position; Duration = $duration }
}

function Write-MusicLevel([double]$Peak) {
    $state = Get-MusicPosition
    $parts = Format-ListeningTrack (Get-MusicTitle)
    Write-Json (Get-MusicLevelFile) ([ordered]@{
        version    = 1
        level      = [double][Math]::Round([Math]::Max(0, $Peak), 4)
        playing    = [bool]$SCRIPT:MusicPlaying
        id         = [string]$SCRIPT:MusicCurrentId
        title      = [string]$parts.Title
        artist     = [string]$parts.Artist
        positionMs = [long]$state.Position
        durationMs = [long]$state.Duration
        at         = [long][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    })
}

# One sample: the level of this process's own audio session, at the same moment
# as the track and the position, so the page never has to align two clocks.
function Update-MusicMeter {
    if (-not $SCRIPT:MeterWanted) { return }
    $peak = 0.0
    if (Initialize-AudioSessions) {
        try { $peak = [double][DshPet.AudioSessions]::OwnPeak($PID) } catch {
            Write-Log "reading the playback level failed: $($_.Exception.Message)"
        }
    }
    if ($peak -lt 0 -or [double]::IsNaN($peak)) { $peak = 0 }
    Write-MusicLevel $peak
}

function Start-MusicMeter {
    # Started by the page when its listening mode opens; a machine without the
    # session API simply has no bars, and the mode still draws the track.
    if ($SCRIPT:MeterWanted) { return }
    if (-not (Initialize-AudioSessions)) { return }
    $SCRIPT:MeterWanted = $true
    if ($null -eq $SCRIPT:MeterTimer) {
        $SCRIPT:MeterTimer = New-Object System.Windows.Threading.DispatcherTimer
        $SCRIPT:MeterTimer.Interval = [TimeSpan]::FromMilliseconds(100)
        $SCRIPT:MeterTimer.Add_Tick({
            try { Update-MusicMeter } catch { Write-Log "the playback meter failed: $($_.Exception.Message)" }
        })
    }
    if (-not $SCRIPT:MeterTimer.IsEnabled) { $SCRIPT:MeterTimer.Start() }
    Update-MusicMeter
}

function Stop-MusicMeter {
    # The page closed its mode: the timer stops and the file is taken away, so a
    # host that asked for nothing finds no reading rather than a stale one.
    if (-not $SCRIPT:MeterWanted) { return }
    $SCRIPT:MeterWanted = $false
    if ($null -ne $SCRIPT:MeterTimer -and $SCRIPT:MeterTimer.IsEnabled) { $SCRIPT:MeterTimer.Stop() }
    try { Remove-Item -LiteralPath (Get-MusicLevelFile) -Force -ErrorAction SilentlyContinue } catch { }
}

# ---- quick access -----------------------------------------------------------
# The panel the menu's quick access entry opens: nine square tiles, the DSH
# Session's directory pinned in the middle and eight folders the person assigned
# around it. A click raises the window that already shows a folder instead of
# opening a second one - the same few folders stay open all day, and finding the
# right window among them is the slow part. The ring is the person's list, kept
# beside the state file and edited one tile at a time from the panel itself.

function Get-ShellApplication {
    # One Shell.Application for the life of this process: building it per call
    # costs more than the question it is used for.
    if ($null -eq $SCRIPT:Shell) { $SCRIPT:Shell = New-Object -ComObject Shell.Application }
    return $SCRIPT:Shell
}

function Get-FolderPath([string]$Path) {
    # One spelling per folder: no trailing separator, except on a drive root,
    # where that separator is the whole path.
    $text = ([string]$Path).Trim()
    if ($text.Length -gt 1) { $text = $text.TrimEnd('\') }
    if ($text.Length -eq 2 -and $text[1] -eq ':') { $text = $text + '\' }
    return $text
}

function New-QuickAccessSlot([string]$Path, [bool]$Main) {
    $text = Get-FolderPath $Path
    $name = [System.IO.Path]::GetFileName($text)
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $text }
    return [pscustomobject]@{
        Path = $text
        Name = $name
        Parent = [System.IO.Path]::GetDirectoryName($text)
        Main = $Main
    }
}

function Get-QuickAccessFile {
    # The eight folders the person assigned, kept beside the state file: they are
    # this machine's paths, chosen on this machine, so they do not travel with the
    # plugin's settings file.
    return (Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'quick-access.json')
}

function Read-QuickAccessFolders {
    # Eight entries, one per ring slot, in the order the tiles are filled. A blank
    # entry leaves its tile empty, which is a choice rather than a missing value.
    # A string array rather than an object one, and built through ::new rather than
    # New-Object: Windows PowerShell's ConvertTo-Json writes either alternative as
    # `{value, Count}`, which reads back as nothing usable.
    $folders = [string[]]::new(8)
    for ($index = 0; $index -lt 8; $index++) { $folders[$index] = '' }
    $stored = Read-Json (Get-QuickAccessFile)
    if ($null -eq $stored -or $null -eq $stored.folders) { return ,$folders }
    $index = 0
    foreach ($entry in @($stored.folders)) {
        if ($index -ge 8) { break }
        $path = Get-FolderPath ([string]$entry)
        if ($path -ne '') { $folders[$index] = $path }
        $index++
    }
    return ,$folders
}

function Save-QuickAccessFolders {
    $entries = [string[]]::new(8)
    for ($index = 0; $index -lt 8; $index++) { $entries[$index] = [string]$SCRIPT:QuickAccessUser[$index] }
    Write-Json (Get-QuickAccessFile) ([ordered]@{ version = 1; folders = $entries })
}

function Get-QuickAccessUser {
    # Loaded on first use rather than at startup: the state file is what fixes the
    # directory this list lives in, and the panel is the only caller.
    if ($null -eq $SCRIPT:QuickAccessUser) { $SCRIPT:QuickAccessUser = Read-QuickAccessFolders }
    return ,$SCRIPT:QuickAccessUser
}

function Get-ExplorerWindows {
    # Every folder window that is open right now, as folder -> window handle. This
    # is what tells an already open folder from one that is not, and that is what
    # lets a click raise a window instead of opening a second one.
    $windows = @{}
    try {
        foreach ($window in @((Get-ShellApplication).Windows())) {
            try {
                $url = [string]$window.LocationURL
                if (-not $url.StartsWith('file:', [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                $path = Get-FolderPath ([System.Uri]::new($url).LocalPath)
                if ($path -eq '') { continue }
                $key = $path.ToLowerInvariant()
                if ($windows.ContainsKey($key)) { continue }
                $handle = [IntPtr]$window.HWND
                if ($handle -eq [IntPtr]::Zero) { continue }
                $windows[$key] = $handle
            } catch {
                Write-Log "one open folder window could not be read: $($_.Exception.Message)"
            }
        }
    } catch {
        Write-Log "reading the open folder windows failed: $($_.Exception.Message)"
    }
    return $windows
}

function Format-QuickAccessSlots($Folders, [string]$MainCwd) {
    # Nine slots with the middle one fixed: the Session's directory is index 4, and
    # ring slot i fills the tile at the i-th ring position in the order the person
    # arranged them. A blank entry leaves its tile empty. Every ring entry keeps the
    # folder the person assigned, even when it is also the Session's own: a tile is
    # what the person edited, not something the Session's directory can hide.
    $main = Get-FolderPath $MainCwd
    $slots = New-Object object[] 9
    if ($main -ne '') { $slots[4] = New-QuickAccessSlot $main $true }
    $order = $SCRIPT:QuickAccessOrder
    $ring = @($Folders)
    for ($index = 0; $index -lt 8; $index++) {
        if ($index -ge $ring.Count) { break }
        $path = Get-FolderPath ([string]$ring[$index])
        if ($path -eq '') { continue }
        $slots[$order[$index]] = New-QuickAccessSlot $path $false
    }
    return ,$slots
}

function Get-QuickAccessRing([int]$Index) {
    # Which entry of the person's list a tile shows: the inverse of the ring order.
    return [Array]::IndexOf($SCRIPT:QuickAccessOrder, $Index)
}

function Get-QuickAccessTiles([double]$Scale) {
    # The tile rectangles, in device pixels: the panel is drawn by hand, so the
    # display scale is applied here rather than by a layout engine. The panel is
    # square, so the padding is the band the header sits in on all four sides:
    # three square tiles, two gaps, and twice that padding.
    $pad = [int](56 * $Scale)
    $gap = [int](12 * $Scale)
    $side = [int](200 * $Scale)
    $tiles = New-Object object[] 9
    for ($index = 0; $index -lt 9; $index++) {
        $column = $index % 3
        $row = [int][Math]::Floor($index / 3)
        $tiles[$index] = [System.Drawing.Rectangle]::new(
            ($pad + $column * ($side + $gap)),
            ($pad + $row * ($side + $gap)),
            $side,
            $side)
    }
    return ,$tiles
}

function Get-QuickAccessFont([float]$Size, [bool]$Bold) {
    $style = [System.Drawing.FontStyle]::Regular
    if ($Bold) { $style = [System.Drawing.FontStyle]::Bold }
    return New-Object System.Drawing.Font('Microsoft YaHei UI', $Size, $style, [System.Drawing.GraphicsUnit]::Point)
}

function Get-RoundedPath([System.Drawing.Rectangle]$Rectangle, [int]$Radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = [Math]::Min($Radius * 2, [Math]::Min($Rectangle.Width, $Rectangle.Height))
    if ($diameter -le 0) {
        $path.AddRectangle($Rectangle)
        return $path
    }
    $arc = [System.Drawing.Rectangle]::new($Rectangle.Location, [System.Drawing.Size]::new($diameter, $diameter))
    $path.AddArc($arc, 180, 90)
    $arc.X = $Rectangle.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Rectangle.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $Rectangle.Left
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Set-QuickAccessRegion($Form, [int]$Radius) {
    $path = Get-RoundedPath ([System.Drawing.Rectangle]::new(0, 0, $Form.Width, $Form.Height)) $Radius
    try {
        $previous = $Form.Region
        $Form.Region = New-Object System.Drawing.Region($path)
        if ($null -ne $previous) { $previous.Dispose() }
    } finally {
        $path.Dispose()
    }
}

function Get-QuickAccessHit([System.Drawing.Point]$Point) {
    for ($index = 0; $index -lt 9; $index++) {
        if ($SCRIPT:QuickAccessTiles[$index].Contains($Point)) { return $index }
    }
    return -1
}

function Set-QuickAccessTileDirty([int]$Index) {
    # One tile repainted rather than the whole panel: the pointer crossing a gap
    # then costs two small regions instead of a full redraw, and a repaint this
    # size is invisible next to the erase the window would otherwise do.
    if ($null -eq $SCRIPT:QuickAccess) { return }
    if ($Index -lt 0 -or $Index -gt 8) { return }
    $tile = $SCRIPT:QuickAccessTiles[$Index]
    try {
        $SCRIPT:QuickAccess.Invalidate([System.Drawing.Rectangle]::new(
            ($tile.Left - 2), ($tile.Top - 2), ($tile.Width + 4), ($tile.Height + 4)))
    } catch { }
}

function Draw-QuickAccessFolder($Graphics, [System.Drawing.Rectangle]$Bounds, [System.Drawing.Color]$Ink, [float]$Scale) {
    # The menu's folder glyph at tile size: the same shape the entry that opened
    # this panel carries, so the tiles read as the same thing.
    $pen = New-Object System.Drawing.Pen($Ink, [Math]::Max(1.3, 1.4 * $Scale))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
        $left = [float]$Bounds.Left
        $top = [float]$Bounds.Top
        $width = [float]$Bounds.Width
        $height = [float]$Bounds.Height
        $points = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(($left + $width * 0.06), ($top + $height * 0.26)),
            [System.Drawing.PointF]::new(($left + $width * 0.34), ($top + $height * 0.26)),
            [System.Drawing.PointF]::new(($left + $width * 0.44), ($top + $height * 0.36)),
            [System.Drawing.PointF]::new(($left + $width * 0.92), ($top + $height * 0.36)),
            [System.Drawing.PointF]::new(($left + $width * 0.92), ($top + $height * 0.84)),
            [System.Drawing.PointF]::new(($left + $width * 0.06), ($top + $height * 0.84)))
        $path.AddLines($points)
        $path.CloseFigure()
        $Graphics.DrawPath($pen, $path)
        $Graphics.DrawLine($pen, ($left + $width * 0.06), ($top + $height * 0.44),
            ($left + $width * 0.92), ($top + $height * 0.44))
    } finally {
        $path.Dispose()
        $pen.Dispose()
    }
}

function Draw-QuickAccessPanel([System.Drawing.Graphics]$Graphics, [int]$Width, [int]$Height) {
    $scale = $SCRIPT:QuickAccessScale
    $width = $Width
    $height = $Height
    $ink = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $muted = [System.Drawing.Color]::FromArgb(150, 158, 172)
    $accent = [System.Drawing.Color]::FromArgb(44, 107, 201)
    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $leftFlags = [System.Windows.Forms.TextFormatFlags]::Left -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::EndEllipsis -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    $rightFlags = [System.Windows.Forms.TextFormatFlags]::Right -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::EndEllipsis -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    $centerFlags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::EndEllipsis -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    # A single digit is narrower than its box, so it is not allowed to ellipsize:
    # an ellipsis on a one-character line reads as a broken number.
    $numberFlags = [System.Windows.Forms.TextFormatFlags]::Right -bor
        [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
        [System.Windows.Forms.TextFormatFlags]::SingleLine -bor
        [System.Windows.Forms.TextFormatFlags]::NoPrefix
    $resources = New-Object System.Collections.Generic.List[object]
    try {
        $canvas = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(252, 252, 253))
        $resources.Add($canvas)
        $Graphics.FillRectangle($canvas, 0, 0, $width, $height)
        $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(221, 224, 230), 1)
        $resources.Add($edge)
        $outline = Get-RoundedPath ([System.Drawing.Rectangle]::new(0, 0, ($width - 1), ($height - 1))) ([int](14 * $scale))
        try { $Graphics.DrawPath($edge, $outline) } finally { $outline.Dispose() }

        # Header: what this panel is, and the gestures that use it. It sits in the
        # same band as the panel's padding, which is what keeps the window square.
        $margin = [int](56 * $scale)
        $titleFont = Get-QuickAccessFont 13 $true
        $resources.Add($titleFont)
        $hintFont = Get-QuickAccessFont 9 $false
        $resources.Add($hintFont)
        $titleTop = [int](16 * $scale)
        $titleHeight = [int](26 * $scale)
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.QuickAccess, $titleFont,
            [System.Drawing.Rectangle]::new($margin, $titleTop, ($width - $margin * 2), $titleHeight),
            $ink, $leftFlags)
        # The hint and the last failure share the one line the header has room for:
        # a failure is what the person needs to read, and the gestures are known
        # once the panel has been used at all.
        $hintText = $SCRIPT:Labels.QuickAccessHint
        $hintColor = $muted
        if (-not [string]::IsNullOrWhiteSpace($SCRIPT:QuickAccessError)) {
            $hintText = $SCRIPT:QuickAccessError
            $hintColor = [System.Drawing.Color]::FromArgb(196, 78, 78)
        }
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $hintText, $hintFont,
            [System.Drawing.Rectangle]::new($margin, $titleTop, ($width - $margin * 2), $titleHeight),
            $hintColor, $rightFlags)
        $rulePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(232, 235, 240), 1)
        $resources.Add($rulePen)
        $ruleY = [int](44 * $scale)
        $Graphics.DrawLine($rulePen, $margin, $ruleY, ($width - $margin), $ruleY)

        $nameFont = Get-QuickAccessFont 11.5 $true
        $resources.Add($nameFont)
        $pathFont = Get-QuickAccessFont 8.75 $false
        $resources.Add($pathFont)
        $chipFont = Get-QuickAccessFont 8.5 $false
        $resources.Add($chipFont)
        $numberFont = Get-QuickAccessFont 8.5 $false
        $resources.Add($numberFont)
        $pad = [int](16 * $scale)
        $iconSize = [int](22 * $scale)
        $mainPath = Get-FolderPath $SCRIPT:MainCwd
        for ($index = 0; $index -lt 9; $index++) {
            $tile = $SCRIPT:QuickAccessTiles[$index]
            $slot = $SCRIPT:QuickAccessSlots[$index]
            if ($null -eq $slot) {
                $emptyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(249, 250, 251))
                $resources.Add($emptyBrush)
                $emptyPath = Get-RoundedPath $tile ([int](10 * $scale))
                try { $Graphics.FillPath($emptyBrush, $emptyPath) } finally { $emptyPath.Dispose() }
                $isMain = ($index -eq 4)
                if ($isMain -and $mainPath -eq '') {
                    [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.QuickAccessNoCwd, $hintFont,
                        [System.Drawing.Rectangle]::new(($tile.Left + $pad), $tile.Top, ($tile.Width - $pad * 2), $tile.Height),
                        $muted, $centerFlags)
                } elseif (-not $isMain) {
                    # An empty slot is where the person says what goes there, so it
                    # carries the gesture rather than a message about being empty.
                    $plusPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 198, 210), [Math]::Max(1.2, 1.4 * $scale))
                    $resources.Add($plusPen)
                    $plusSize = [int](10 * $scale)
                    $centerX = $tile.Left + [int]($tile.Width / 2)
                    $centerY = $tile.Top + [int]($tile.Height / 2) - [int](10 * $scale)
                    $Graphics.DrawLine($plusPen, ($centerX - $plusSize), $centerY, ($centerX + $plusSize), $centerY)
                    $Graphics.DrawLine($plusPen, $centerX, ($centerY - $plusSize), $centerX, ($centerY + $plusSize))
                    [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.QuickAccessPickShort, $hintFont,
                        [System.Drawing.Rectangle]::new(($tile.Left + $pad), ($centerY + [int](16 * $scale)),
                            ($tile.Width - $pad * 2), [int](22 * $scale)),
                        $muted, $centerFlags)
                }
                continue
            }
            $fillColor = [System.Drawing.Color]::FromArgb(247, 248, 250)
            if ($slot.Main) { $fillColor = [System.Drawing.Color]::FromArgb(234, 241, 252) }
            if ($index -eq $SCRIPT:QuickAccessHover) { $fillColor = [System.Drawing.Color]::FromArgb(238, 243, 250) }
            $borderColor = [System.Drawing.Color]::FromArgb(228, 231, 236)
            if ($index -eq $SCRIPT:QuickAccessFocus) { $borderColor = [System.Drawing.Color]::FromArgb(159, 191, 240) }
            $fill = New-Object System.Drawing.SolidBrush($fillColor)
            $resources.Add($fill)
            $border = New-Object System.Drawing.Pen($borderColor, 1)
            $resources.Add($border)
            $tilePath = Get-RoundedPath $tile ([int](10 * $scale))
            try {
                $Graphics.FillPath($fill, $tilePath)
                $Graphics.DrawPath($border, $tilePath)
            } finally {
                $tilePath.Dispose()
            }
            # Stacked rather than in a row: the name gets the tile's whole width,
            # which is what a project folder with a long name needs to stay
            # readable next to its siblings.
            Draw-QuickAccessFolder $Graphics ([System.Drawing.Rectangle]::new(
                ($tile.Left + $pad), ($tile.Top + $pad), $iconSize, $iconSize)) $ink $scale
            [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $slot.Name, $nameFont,
                [System.Drawing.Rectangle]::new(($tile.Left + $pad), ($tile.Top + $pad + [int](32 * $scale)),
                    ($tile.Width - $pad * 2), [int](26 * $scale)),
                $ink, $leftFlags)
            $parentText = if ([string]::IsNullOrWhiteSpace([string]$slot.Parent)) { '' } else { [string]$slot.Parent }
            if ($parentText -ne '') {
                [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $parentText, $pathFont,
                    [System.Drawing.Rectangle]::new(($tile.Left + $pad), ($tile.Top + $pad + [int](60 * $scale)),
                        ($tile.Width - $pad * 2), [int](18 * $scale)),
                    $muted, $leftFlags)
            }
            $chipTop = $tile.Bottom - [int](20 * $scale) - [int](16 * $scale)
            # The tile's own digit, because the keyboard reaches the same tiles: the
            # number is how a person learns that. It shares the bottom row with the
            # status, which leaves the name a full line above it.
            [System.Windows.Forms.TextRenderer]::DrawText($Graphics, [string]($index + 1), $numberFont,
                [System.Drawing.Rectangle]::new(($tile.Right - $pad - [int](20 * $scale)), $chipTop,
                    [int](20 * $scale), [int](20 * $scale)),
                [System.Drawing.Color]::FromArgb(186, 193, 205), $numberFlags)
            if ($slot.Main) {
                $chipText = $SCRIPT:Labels.QuickAccessCurrent
                $chipSize = [System.Windows.Forms.TextRenderer]::MeasureText($chipText, $chipFont)
                $chipWidth = [int]($chipSize.Width + 16 * $scale)
                $chipHeight = [int](20 * $scale)
                $chipRect = [System.Drawing.Rectangle]::new(($tile.Left + $pad), $chipTop, $chipWidth, $chipHeight)
                $chipBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 231, 252))
                $resources.Add($chipBrush)
                $chipPath = Get-RoundedPath $chipRect ([int](10 * $scale))
                try { $Graphics.FillPath($chipBrush, $chipPath) } finally { $chipPath.Dispose() }
                [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $chipText, $chipFont, $chipRect, $accent, $centerFlags)
            } elseif ($SCRIPT:QuickAccessOpen.ContainsKey($slot.Path.ToLowerInvariant())) {
                $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(63, 163, 107))
                $resources.Add($dotBrush)
                $dotSize = [int](6 * $scale)
                $Graphics.FillEllipse($dotBrush, ($tile.Left + $pad), ($chipTop + [int](7 * $scale)), $dotSize, $dotSize)
                [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.QuickAccessOpen, $chipFont,
                    [System.Drawing.Rectangle]::new(($tile.Left + $pad + $dotSize + [int](6 * $scale)), $chipTop,
                        ($tile.Width - $pad * 2), [int](20 * $scale)),
                    $muted, $leftFlags)
            }
        }
    } finally {
        foreach ($resource in $resources) {
            try { $resource.Dispose() } catch { }
        }
    }
}

function Write-QuickAccessProbe([string]$Path) {
    # The panel drawn offscreen: no window opens, and what a person would see is
    # written where it can be looked at, so a tile layout that came out wrong is
    # visible without a menu click.
    $pad = [int](56 * $SCRIPT:QuickAccessScale)
    $bitmap = New-Object System.Drawing.Bitmap(
        ($SCRIPT:QuickAccessTiles[8].Right + $pad), ($SCRIPT:QuickAccessTiles[8].Bottom + $pad))
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        Draw-QuickAccessPanel $graphics $bitmap.Width $bitmap.Height
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Move-QuickAccessFocus([int]$Delta) {
    $candidate = $SCRIPT:QuickAccessFocus
    for ($step = 0; $step -lt 9; $step++) {
        $candidate = ((($candidate + $Delta) % 9) + 9) % 9
        if ($null -ne $SCRIPT:QuickAccessSlots[$candidate]) {
            $SCRIPT:QuickAccessFocus = $candidate
            return
        }
    }
}

function Update-QuickAccessPanel {
    # Rebuilt from the person's list and the published directory: the tiles say
    # which windows are open, and tiles that no longer match them are worse than
    # none.
    if ($null -eq $SCRIPT:QuickAccess) { return }
    try {
        $SCRIPT:QuickAccessSlots = Format-QuickAccessSlots (Get-QuickAccessUser) $SCRIPT:MainCwd
        $SCRIPT:QuickAccessOpen = Get-ExplorerWindows
        $SCRIPT:QuickAccessError = ''
        $SCRIPT:QuickAccess.Invalidate()
    } catch {
        Write-Log "refreshing the quick access panel failed: $($_.Exception.Message)"
    }
}

function Invoke-QuickAccessSlot([int]$Index) {
    if ($null -eq $SCRIPT:QuickAccess) { return }
    $slot = $SCRIPT:QuickAccessSlots[$Index]
    if ($null -eq $slot) { return }
    $SCRIPT:QuickAccessBusy = $true
    try {
        if (-not [System.IO.Directory]::Exists($slot.Path)) {
            $SCRIPT:QuickAccessError = "$($SCRIPT:Labels.QuickAccessFailed) $($slot.Path)"
            $SCRIPT:QuickAccess.Invalidate()
            return
        }
        # Raised before this panel goes away: handing the foreground to another
        # window is only allowed while this process is the one in front.
        $windows = Get-ExplorerWindows
        $key = $slot.Path.ToLowerInvariant()
        if ($windows.ContainsKey($key)) {
            $handle = [IntPtr]$windows[$key]
            if ([DshPet.Win32]::IsIconic($handle)) {
                [void][DshPet.Win32]::ShowWindow($handle, $SCRIPT:SwRestore)
            }
            [void][DshPet.Win32]::SetForegroundWindow($handle)
        } else {
            # The folder handed to the shell, which is how a double click on one
            # opens it, and the one way to name a path without quoting rules.
            $start = New-Object System.Diagnostics.ProcessStartInfo
            $start.FileName = $slot.Path
            $start.UseShellExecute = $true
            [void][System.Diagnostics.Process]::Start($start)
        }
    } catch {
        $SCRIPT:QuickAccessError = "$($SCRIPT:Labels.QuickAccessFailed) $($_.Exception.Message)"
        try { $SCRIPT:QuickAccess.Invalidate() } catch { }
        return
    } finally {
        $SCRIPT:QuickAccessBusy = $false
    }
    Close-QuickAccess
}

function Restore-QuickAccessFocus {
    # A dialog or the tile menu takes the foreground, which is what would otherwise
    # close the panel; this is the way back, so Escape and the arrow keys keep
    # working on a panel that is still open.
    $SCRIPT:QuickAccessBusy = $false
    $form = $SCRIPT:QuickAccess
    if ($null -eq $form) { return }
    try { $form.Activate() } catch { }
    try { [void][DshPet.Win32]::SetForegroundWindow($form.Handle) } catch { }
}

function Select-QuickAccessFolder([int]$Ring) {
    # One tile's folder, chosen by the person: the only way the list changes.
    if ($Ring -lt 0 -or $Ring -ge 8) { return }
    if ($null -eq $SCRIPT:QuickAccessUser) { $SCRIPT:QuickAccessUser = Read-QuickAccessFolders }
    $owner = $SCRIPT:QuickAccess
    $SCRIPT:QuickAccessBusy = $true
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    try {
        $dialog.Description = $SCRIPT:Labels.QuickAccessPickTitle
        $dialog.ShowNewFolderButton = $true
        $current = [string]$SCRIPT:QuickAccessUser[$Ring]
        if ($current -ne '' -and [System.IO.Directory]::Exists($current)) { $dialog.SelectedPath = $current }
        $answer = if ($null -ne $owner) { $dialog.ShowDialog($owner) } else { $dialog.ShowDialog() }
        if ($answer -eq [System.Windows.Forms.DialogResult]::OK) {
            $path = Get-FolderPath ([string]$dialog.SelectedPath)
            if ($path -ne '') {
                $SCRIPT:QuickAccessUser[$Ring] = $path
                Save-QuickAccessFolders
                Update-QuickAccessPanel
            }
        }
    } catch {
        Write-Log "choosing a folder failed: $($_.Exception.Message)"
        $SCRIPT:QuickAccessError = "$($SCRIPT:Labels.QuickAccessFailed) $($_.Exception.Message)"
    } finally {
        try { $dialog.Dispose() } catch { }
        Restore-QuickAccessFocus
    }
}

function Clear-QuickAccessTile([int]$Ring) {
    if ($Ring -lt 0 -or $Ring -ge 8) { return }
    if ($null -eq $SCRIPT:QuickAccessUser) { $SCRIPT:QuickAccessUser = Read-QuickAccessFolders }
    $SCRIPT:QuickAccessUser[$Ring] = ''
    Save-QuickAccessFolders
    Update-QuickAccessPanel
    Restore-QuickAccessFocus
}

function Complete-QuickAccessMenu {
    # Runs when the tile menu has closed - which WinForms does *before* it delivers
    # the chosen item's click, so this cannot tell a choice from a dismissal. It
    # only puts the panel back in front; a choice's work is queued separately and
    # takes the flag over from there.
    #
    # The strip itself is not disposed here and is not recreated per open: Closed
    # runs while WinForms is still unwinding the click that closed it, and taking
    # its handle away at that moment is what crashed this process. One strip is
    # kept for the panel's life and disposed with it.
    $SCRIPT:QuickAccessBusy = $false
    Restore-QuickAccessFocus
}

function Invoke-QuickAccessMenuPick {
    # The handlers reach the tile through the script scope rather than a closure: a
    # handler made with GetNewClosure runs in a scope of its own, where reading
    # $SCRIPT: finds that scope and not this one.
    Start-QuickAccessMenuAction 'pick'
}

function Invoke-QuickAccessMenuClear {
    Start-QuickAccessMenuAction 'clear'
}

function Start-QuickAccessMenuAction([string]$Action) {
    # Queued rather than run inside the click: the menu is still dismissing then, and
    # a modal folder picker opened from the middle of that dismissal keeps the strip
    # half-closed. The ring entry is read when the action runs, so it is stored here
    # rather than passed through the queue.
    $SCRIPT:QuickAccessPendingAction = $Action
    $SCRIPT:QuickAccessPendingRing = [int]$SCRIPT:QuickAccessMenuRing
    $SCRIPT:QuickAccessBusy = $true
    $form = $SCRIPT:QuickAccess
    if ($null -ne $form -and $form.IsHandleCreated -and -not $form.IsDisposed) {
        try {
            [void]$form.BeginInvoke([System.Action]{ Invoke-QuickAccessPending })
            return
        } catch {
            Write-Log "queueing a quick access menu action failed: $($_.Exception.Message)"
        }
    }
    Invoke-QuickAccessPending
}

function Invoke-QuickAccessPending {
    $action = [string]$SCRIPT:QuickAccessPendingAction
    $ring = [int]$SCRIPT:QuickAccessPendingRing
    $SCRIPT:QuickAccessPendingAction = ''
    $SCRIPT:QuickAccessPendingRing = -1
    # A pick queued by a panel that has meanwhile gone away is nothing to do.
    if ($null -eq $SCRIPT:QuickAccess) {
        $SCRIPT:QuickAccessBusy = $false
        return
    }
    if ($action -eq 'pick') {
        try { Select-QuickAccessFolder $ring } catch {
            Write-Log "choosing a quick access folder failed: $($_.Exception.Message)"
        }
    } elseif ($action -eq 'clear') {
        try { Clear-QuickAccessTile $ring } catch {
            Write-Log "clearing a quick access tile failed: $($_.Exception.Message)"
        }
    }
}

function Get-QuickAccessMenu {
    # One menu for the panel's life: built on first use, its items fixed, and the
    # clear row hidden for a tile that has nothing to clear.
    if ($null -ne $SCRIPT:QuickAccessMenu) { return $SCRIPT:QuickAccessMenu }
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $menu.ShowImageMargin = $false
    $menu.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $menu.ForeColor = [System.Drawing.Color]::FromArgb(53, 59, 70)
    $menu.MinimumSize = New-Object System.Drawing.Size(180, 0)
    try {
        $menu.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Regular,
            [System.Drawing.GraphicsUnit]::Point)
    } catch { }
    $pick = $menu.Items.Add($SCRIPT:Labels.QuickAccessPick)
    $pick.add_Click({ Invoke-QuickAccessMenuPick })
    $clear = $menu.Items.Add($SCRIPT:Labels.QuickAccessClear)
    $clear.add_Click({ Invoke-QuickAccessMenuClear })
    $SCRIPT:QuickAccessMenuClearItem = $clear
    $menu.add_Closed({ Complete-QuickAccessMenu })
    $SCRIPT:QuickAccessMenu = $menu
    return $menu
}

function Show-QuickAccessTileMenu([int]$Index, [System.Drawing.Point]$Point) {
    # One tile's own menu: what goes there, or nothing at all. A right click is the
    # only way the list changes, so it carries both choices; the empty middle tile
    # has neither, because which Session is in front is not the person's to set.
    $form = $SCRIPT:QuickAccess
    if ($null -eq $form -or $Index -lt 0 -or $Index -eq 4) { return }
    $ring = Get-QuickAccessRing $Index
    if ($ring -lt 0) { return }
    if ($null -eq $SCRIPT:QuickAccessUser) { $SCRIPT:QuickAccessUser = Read-QuickAccessFolders }
    $menu = Get-QuickAccessMenu
    $SCRIPT:QuickAccessMenuRing = $ring
    if ($null -ne $SCRIPT:QuickAccessMenuClearItem) {
        $SCRIPT:QuickAccessMenuClearItem.Visible =
            -not [string]::IsNullOrWhiteSpace([string]$SCRIPT:QuickAccessUser[$ring])
    }
    $SCRIPT:QuickAccessBusy = $true
    $menu.Show($form, $Point)
}

function Close-QuickAccess {
    $form = $SCRIPT:QuickAccess
    if ($null -eq $form) { return }
    $SCRIPT:QuickAccess = $null
    $SCRIPT:QuickAccessHover = -1
    # A tile menu still open belongs to this panel: closing the panel discards it
    # too. The strip is disposed only here, once its own dismissal has finished,
    # and the next panel builds a fresh one.
    if ($null -ne $SCRIPT:QuickAccessMenu) {
        try { $SCRIPT:QuickAccessMenu.Close() } catch { }
        try { $SCRIPT:QuickAccessMenu.Dispose() } catch { }
        $SCRIPT:QuickAccessMenu = $null
        $SCRIPT:QuickAccessMenuClearItem = $null
        $SCRIPT:QuickAccessMenuRing = -1
    }
    # Close rather than Dispose: the click that got here is still running inside
    # this form's own event handler, and WinForms finishes the teardown after that
    # returns.
    try { $form.Close() } catch {
        Write-Log "closing the quick access panel failed: $($_.Exception.Message)"
    }
}

function Start-QuickAccess {
    if ($null -ne $SCRIPT:QuickAccess) {
        Update-QuickAccessPanel
        try { $SCRIPT:QuickAccess.Activate() } catch { }
        return
    }
    $form = New-Object System.Windows.Forms.Form
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.ShowInTaskbar = $false
    $form.TopMost = $true
    $form.KeyPreview = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $form.Text = $SCRIPT:Labels.QuickAccess
    # Double buffering is the difference between a panel that repaints cleanly and
    # one that flickers at every pointer move: without it the window erases its
    # background before the paint, and a hand-drawn surface shows that gap. The
    # property is protected on Control, so it is set through reflection rather
    # than through a subclass this script would otherwise have to compile.
    try {
        $buffered = [System.Windows.Forms.Control].GetProperty('DoubleBuffered',
            ([System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic))
        if ($null -ne $buffered) { $buffered.SetValue($form, $true) }
    } catch {
        Write-Log "enabling double buffering failed: $($_.Exception.Message)"
    }
    # The panel is drawn by hand, so the display's scale is applied to the
    # geometry here rather than inherited from a layout engine.
    [void]$form.Handle
    $measure = [System.Drawing.Graphics]::FromHwnd($form.Handle)
    try { $SCRIPT:QuickAccessScale = $measure.DpiX / 96.0 } finally { $measure.Dispose() }
    $scale = $SCRIPT:QuickAccessScale
    $SCRIPT:QuickAccessTiles = Get-QuickAccessTiles $scale
    # Square: the padding equals the band the header sits in, so the same number
    # closes the window on the right and at the bottom.
    $pad = [int](56 * $scale)
    $form.Width = $SCRIPT:QuickAccessTiles[8].Right + $pad
    $form.Height = $SCRIPT:QuickAccessTiles[8].Bottom + $pad
    Set-QuickAccessRegion $form ([int](14 * $scale))
    $SCRIPT:QuickAccessHover = -1
    $SCRIPT:QuickAccessFocus = 4
    $SCRIPT:QuickAccessError = ''
    if ($null -eq $SCRIPT:QuickAccessUser) { $SCRIPT:QuickAccessUser = Read-QuickAccessFolders }

    $form.add_Paint({
        param($sender, $eventArgs)
        try {
            # The size comes from the window rather than from the clip: a hover
            # repaints one tile, and a layout measured off the clip would move the
            # header and the outline onto that tile.
            Draw-QuickAccessPanel $eventArgs.Graphics $sender.ClientSize.Width $sender.ClientSize.Height
        } catch {
            Write-Log "drawing the quick access panel failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseMove({
        param($sender, $eventArgs)
        try {
            $hit = Get-QuickAccessHit $eventArgs.Location
            if ($hit -eq $SCRIPT:QuickAccessHover) { return }
            $previous = $SCRIPT:QuickAccessHover
            $SCRIPT:QuickAccessHover = $hit
            if ($hit -ge 0 -and $null -ne $SCRIPT:QuickAccessSlots[$hit]) {
                $sender.Cursor = [System.Windows.Forms.Cursors]::Hand
            } else {
                $sender.Cursor = [System.Windows.Forms.Cursors]::Default
            }
            Set-QuickAccessTileDirty $previous
            Set-QuickAccessTileDirty $hit
        } catch {
            Write-Log "tracking the pointer failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseUp({
        param($sender, $eventArgs)
        try {
            $hit = Get-QuickAccessHit $eventArgs.Location
            if ($hit -lt 0) { return }
            if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
                Show-QuickAccessTileMenu $hit $eventArgs.Location
                return
            }
            if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
            if ($null -eq $SCRIPT:QuickAccessSlots[$hit]) {
                # An empty ring tile is an offer, not a dead square: clicking it is
                # how the person fills it. The middle tile is not editable - which
                # Session is in front is not theirs to set.
                if ($hit -ne 4) { Select-QuickAccessFolder (Get-QuickAccessRing $hit) }
                return
            }
            $SCRIPT:QuickAccessFocus = $hit
            Invoke-QuickAccessSlot $hit
        } catch {
            Write-Log "a quick access tile failed: $($_.Exception.Message)"
        }
    })
    $form.add_KeyDown({
        param($sender, $eventArgs)
        try {
            $key = $eventArgs.KeyCode
            if ($key -eq [System.Windows.Forms.Keys]::Escape) {
                $eventArgs.Handled = $true
                Close-QuickAccess
                return
            }
            if ($key -eq [System.Windows.Forms.Keys]::Left -or $key -eq [System.Windows.Forms.Keys]::Up) {
                $eventArgs.Handled = $true
                $before = $SCRIPT:QuickAccessFocus
                Move-QuickAccessFocus -1
                Set-QuickAccessTileDirty $before
                Set-QuickAccessTileDirty $SCRIPT:QuickAccessFocus
                return
            }
            if ($key -eq [System.Windows.Forms.Keys]::Right -or $key -eq [System.Windows.Forms.Keys]::Down) {
                $eventArgs.Handled = $true
                $before = $SCRIPT:QuickAccessFocus
                Move-QuickAccessFocus 1
                Set-QuickAccessTileDirty $before
                Set-QuickAccessTileDirty $SCRIPT:QuickAccessFocus
                return
            }
            if ($key -eq [System.Windows.Forms.Keys]::Enter -or $key -eq [System.Windows.Forms.Keys]::Space) {
                $eventArgs.Handled = $true
                Invoke-QuickAccessSlot $SCRIPT:QuickAccessFocus
                return
            }
            if ($key -ge [System.Windows.Forms.Keys]::D1 -and $key -le [System.Windows.Forms.Keys]::D9) {
                $eventArgs.Handled = $true
                Invoke-QuickAccessSlot ($key - [System.Windows.Forms.Keys]::D1)
            }
        } catch {
            Write-Log "a quick access key failed: $($_.Exception.Message)"
        }
    })
    $form.add_Deactivate({
        param($sender, $eventArgs)
        try {
            # Opening a tile makes this panel lose the foreground on purpose, and
            # the menu that opened it finishes closing just after the panel
            # appears: neither is the person leaving.
            if ($null -eq $SCRIPT:QuickAccess) { return }
            if ($SCRIPT:QuickAccessBusy) { return }
            if (([Environment]::TickCount - $SCRIPT:QuickAccessShownAt) -lt 600) { return }
            Close-QuickAccess
        } catch {
            Write-Log "closing the quick access panel failed: $($_.Exception.Message)"
        }
    })
    $form.add_FormClosed({
        $SCRIPT:QuickAccess = $null
    })

    $SCRIPT:QuickAccess = $form
    $SCRIPT:QuickAccessShownAt = [Environment]::TickCount
    Update-QuickAccessPanel
    # The panel opens where the person is working: the screen the pointer is on,
    # which is the one the pet was right-clicked on.
    $area = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).WorkingArea
    $left = $area.Left + [int](($area.Width - $form.Width) / 2)
    $top = $area.Top + [int](($area.Height - $form.Height) / 2)
    $form.Left = [Math]::Max($area.Left, [Math]::Min($left, ($area.Right - $form.Width)))
    $form.Top = [Math]::Max($area.Top, [Math]::Min($top, ($area.Bottom - $form.Height)))
    $form.Show()
    $form.Activate()
    # Escape is only heard by the window that has the focus, so the panel asks
    # for it twice: Activate() moves within this process, and SetForegroundWindow
    # asks the system. The click that chose the menu entry is what makes the
    # second one allowed.
    [void][DshPet.Win32]::SetForegroundWindow($form.Handle)
}

# ---- self test --------------------------------------------------------------
if ($SelfTest) {
    $states = @(Get-ChildItem -LiteralPath $SCRIPT:AssetDir -Directory | Sort-Object Name | ForEach-Object {
        "$($_.Name)=$(Get-FrameCount $_.Name)"
    })
    Write-Output "labels: $($SCRIPT:Labels.Chat) / $($SCRIPT:Labels.AlertNotice) / $($SCRIPT:Labels.Git) / $($SCRIPT:Labels.QuickAccess) / $($SCRIPT:Labels.Sites) / $($SCRIPT:Labels.Games) / $($SCRIPT:Labels.Aquarium) / $($SCRIPT:Labels.FishTank) / $($SCRIPT:Labels.Shot) / $($SCRIPT:Labels.Settings) / $($SCRIPT:Labels.System) / $($SCRIPT:Labels.UpdateDsh) / $($SCRIPT:Labels.RestartDsh) / $($SCRIPT:Labels.QuitDsh) / $($SCRIPT:Labels.Features) / $($SCRIPT:Labels.VideoClip) / $($SCRIPT:Labels.TempSpace) / $($SCRIPT:Labels.Music) / $($SCRIPT:Labels.MusicSettings) / $($SCRIPT:Labels.MusicPlay) / $($SCRIPT:Labels.MusicPause) / $($SCRIPT:Labels.MusicNext) / $($SCRIPT:Labels.MusicPrev) / $($SCRIPT:Labels.MusicSync)"
    Write-Output "assets: $($states -join ', ')"
    Write-Output "state-file: $SCRIPT:StateFile"
    Write-Output "build-result: $SCRIPT:BuildResultFile"
    # Which command brings DSH back decides whether it comes back the way it was:
    # SW_RESTORE also returns a maximized or fullscreen window to the size it had
    # before, so only a minimized window is restored and a hidden one is shown.
    Write-Output "show-commands: minimized=$(Get-ShowCommand $true) hidden=$(Get-ShowCommand $false)"
    # Whether a click hides DSH or brings it forward is the other decision that
    # cannot be read off the window after the fact, so it is printed here too: only
    # a window that is both on screen and in front is tucked away.
    Write-Output "click-intent: front=$(Get-ClickIntent $true $true) behind=$(Get-ClickIntent $true $false) hidden=$(Get-ClickIntent $false $false) minimized=$(Get-ClickIntent $false $true)"
    # Recording a region is three decisions that cannot be read off a running pet:
    # the area has to be even and inside the desktop, the clock is what the bar
    # says, and the argument list is what ffmpeg is started with. A clip window
    # started with the wrong offset records the wrong part of the screen, and an
    # odd width is refused by x264 rather than noticed later.
    $recordScreen = [System.Drawing.Rectangle]::new(0, 0, 1920, 1080)
    $recordOdd = Get-RecordRectangle ([System.Drawing.Point]::new(10, 10)) ([System.Drawing.Point]::new(301, 201)) $recordScreen
    $recordOutside = Get-RecordRectangle ([System.Drawing.Point]::new(-50, -40)) ([System.Drawing.Point]::new(100, 60)) $recordScreen
    Write-Output ("record-rect: odd=$($recordOdd.X),$($recordOdd.Y),$($recordOdd.Width)x$($recordOdd.Height)" `
        + " clamp=$($recordOutside.X),$($recordOutside.Y),$($recordOutside.Width)x$($recordOutside.Height)")
    Write-Output ("record-clock: zero=$(Format-RecordClock 0) minute=$(Format-RecordClock 65000)" `
        + " hour=$(Format-RecordClock 3723000)")
    $recordName = Split-Path -Leaf (Get-RecordFileName 'C:\probe')
    Write-Output ("record-name: $recordName")
    $recordArea = [System.Drawing.Rectangle]::new(100, 50, 640, 360)
    Write-Output ("record-args: " + ((Get-RecordArguments $recordArea 'C:\probe\a.mp4') -join ' '))
    # The bar is placed outside the area it controls: above it when there is room,
    # and nowhere at all when the recording covers the whole desktop.
    $recordBar = Get-RecordBarBounds $recordArea ([System.Drawing.Size]::new(180, 40)) $recordScreen
    $recordCovered = Get-RecordBarBounds ([System.Drawing.Rectangle]::new(0, 0, 1920, 1080)) ([System.Drawing.Size]::new(180, 40)) $recordScreen
    Write-Output ("record-bar: normal=$($recordBar.X),$($recordBar.Y) covered=$($recordCovered.Width)x$($recordCovered.Height)")
    # What the submenu row reads before and during a recording. A placeholder
    # process stands in for ffmpeg: the row only asks whether one exists.
    $recordProbeItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $SCRIPT:RecordMenuItems = @($recordProbeItem)
    Update-RecordMenu
    $recordIdleText = $recordProbeItem.Text
    $SCRIPT:RecordProcess = New-Object System.Diagnostics.Process
    Update-RecordMenu
    $recordLiveText = $recordProbeItem.Text
    $recordLiveIcon = $recordProbeItem.Tag
    $SCRIPT:RecordProcess = $null
    Update-RecordMenu
    $SCRIPT:RecordMenuItems = @()
    Write-Output ("record-menu: idle=$recordIdleText live=$recordLiveText icon=$recordLiveIcon back=$($recordProbeItem.Text)")
    # The folder a recording goes to: the settings card may name one, and a blank
    # setting is the recordings directory beside the state file.
    Write-Output ("record-dir: blank=$(Select-RecordDir $null) named=$(Select-RecordDir ([pscustomobject]@{ recordDir = 'D:\AI\Tmp\record' }))")
    # The frame is a window border before anything is recorded: eight grips, each
    # moving its own edges, a middle that drags, a frame clipped to the desktop and
    # never below the smallest size a grip can still find.
    $probeFrame = [System.Drawing.Rectangle]::new(100, 100, 200, 150)
    $probeScreen = [System.Drawing.Rectangle]::new(0, 0, 1920, 1080)
    $probeNorthWest = Resize-RecordFrame $probeFrame 0 ([System.Drawing.Point]::new(-20, -10)) $probeScreen
    $probeSouthEast = Resize-RecordFrame $probeFrame 4 ([System.Drawing.Point]::new(30, 20)) $probeScreen
    $probeMoved = Move-RecordFrame $probeFrame ([System.Drawing.Point]::new(5, 7)) $probeScreen
    $probeTiny = Resize-RecordFrame $probeFrame 3 ([System.Drawing.Point]::new(-500, 0)) $probeScreen
    $probeGrip = Get-RecordFrameHandle $probeFrame ([System.Drawing.Point]::new(300, 175))
    Write-Output ("record-frame: nw=$($probeNorthWest.X),$($probeNorthWest.Y),$($probeNorthWest.Width)x$($probeNorthWest.Height)" `
        + " se=$($probeSouthEast.X),$($probeSouthEast.Y),$($probeSouthEast.Width)x$($probeSouthEast.Height)" `
        + " move=$($probeMoved.X),$($probeMoved.Y) tiny=$($probeTiny.Width)x$($probeTiny.Height) grip=$probeGrip")
    Write-Output ("record-size: small=$(Format-RecordSize 2048) large=$(Format-RecordSize 5242880)")
    $probePreviewLayout = Get-RecordPreviewLayout 320 200 $probeScreen
    Write-Output ("record-preview: fit=$($probePreviewLayout.ImageWidth)x$($probePreviewLayout.ImageHeight)" `
        + " scale=$($probePreviewLayout.Scale)")
    # A reminder for somebody who is not looking at the pet is only news when an
    # agent starts waiting: the first state a pet applies is not a transition, and
    # a state file rewritten while the question still stands must not ring again.
    Write-Output ("alert-notice: enter=$((Test-ShouldAnnounceAlert 'working' 'alert' $true))" `
        + " seeded=$((Test-ShouldAnnounceAlert '' 'alert' $true))" `
        + " same=$((Test-ShouldAnnounceAlert 'alert' 'alert' $true))" `
        + " off=$((Test-ShouldAnnounceAlert 'working' 'alert' $false))")
    # Stepping the music aside for another player is the third decision of that kind:
    # whether the step comes back, and after how much silence, is what decides whether
    # somebody's video keeps being interrupted, and it cannot be read off a running
    # pet. The samples are one second apart, the sustain is two of them, and the hold
    # is the configured three seconds; the last case is a hold of zero, which comes
    # back on the first quiet sample.
    Write-Output ("duck-decision: " + (@(
        "quiet=$((Get-MusicDuckDecision $false $false 0 0 3 2).Action)",
        "loud-1=$((Get-MusicDuckDecision $false $true 0 0 3 2).Action)",
        "loud-2=$((Get-MusicDuckDecision $false $true 1 0 3 2).Action)",
        "stepped-quiet-1=$((Get-MusicDuckDecision $true $false 0 0 3 2).Action)",
        "stepped-quiet-3=$((Get-MusicDuckDecision $true $false 0 2 3 2).Action)",
        "stepped-loud=$((Get-MusicDuckDecision $true $true 0 2 3 2).Action)",
        "stepped-hold-0=$((Get-MusicDuckDecision $true $false 0 0 0 2).Action)"
    ) -join ' '))
    # And the slope itself, which is otherwise only visible by listening: one step of
    # a one-second fade is 50/1000 of the way, it stops on the target rather than
    # overshooting, and the last step up lands exactly on full volume.
    $invariant = [System.Globalization.CultureInfo]::InvariantCulture
    Write-Output ("duck-fade: down=$((Get-MusicDuckGain 1 0.2 50 1000).ToString($invariant))" `
        + " arrive=$((Get-MusicDuckGain 0.25 0.2 50 1000).ToString($invariant))" `
        + " up=$((Get-MusicDuckGain 0.2 1 50 1000).ToString($invariant))" `
        + " full=$((Get-MusicDuckGain 0.98 1 50 1000).ToString($invariant))")
    # What the player is actually told, which is where a fractional volume can be lost:
    # the clamp has to stay in double arithmetic, or a fifth of 4% reads as silence.
    Write-Output ("duck-output: full=$((Get-MusicOutputVolume 70 1).ToString($invariant))" `
        + " faded=$((Get-MusicOutputVolume 4 0.2).ToString($invariant))" `
        + " silent=$((Get-MusicOutputVolume 0 1).ToString($invariant))")
    # The sites entry is the menu's only part that hands its work to the page rather
    # than acting here, so it is built without being shown and the command it writes
    # is printed. DshPid is 0 here, so raising DSH would be a no-op anyway - but
    # Show-DshWindow is also defined further down this script, which has not run yet
    # at this point, so it is stubbed for the probe rather than reached.
    function Show-DshWindow { }
    $probeMenu = New-Object System.Windows.Forms.ContextMenuStrip
    $sitesItem = New-SitesItem $probeMenu.Items
    $probeCommand = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'command.json'
    if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
    $sitesItem.PerformClick()
    $clicked = Read-Json $probeCommand
    $siteClick = if ($null -eq $clicked) { 'no-command' } else { [string]$clicked.command }
    Write-Output "site-item: $($sitesItem.Text)[$($sitesItem.Enabled)] >> site-click=$siteClick"
    $probeMenu.Dispose()
    # Music is rebuilt from the library the host publishes at every open, so what is
    # worth checking here is what each library turns into: the status line, the three
    # transport entries, the download entry's count, and the one entry that leaves
    # this process. A transport entry is never clicked here - that would build a media
    # player and open a file this probe does not have - but the two entries that only
    # write a command are, because a handler reading the wrong scope still shows the
    # right text (the same trap the sites probe describes above).
    # Whether an ended media moves the list on is decided by the generation that
    # opened, because a replaced media reports an end without an open: that decision
    # is printed here, with the three states it can be in.
    $SCRIPT:MusicTracks = @([pscustomobject]@{ Id = 'probe'; Title = 'probe'; File = 'C:\probe.m4a' })
    $SCRIPT:MusicGeneration = 3
    $SCRIPT:MusicOpenGeneration = 3
    $endedProbe = "opened=$(Test-MusicEndedAdvance)"
    $SCRIPT:MusicOpenGeneration = 2
    $endedProbe = "$endedProbe replaced=$(Test-MusicEndedAdvance)"
    $SCRIPT:MusicTracks = @()
    $endedProbe = "$endedProbe empty=$(Test-MusicEndedAdvance)"
    Write-Output "music-ended: $endedProbe"
    $SCRIPT:MusicMenu = New-Object System.Windows.Forms.ToolStripMenuItem
    $musicProbeLines = New-Object System.Collections.Generic.List[string]
    # A probe writes, reads, and deletes the files it works on, so it uses its own:
    # the library and the playback state beside a real state file belong to a running
    # pet, and a diagnostic must not take away its position, the watermark that keeps
    # an already-applied command from being applied twice, or the library the host
    # published.
    $SCRIPT:MusicFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'music-probe.json'
    $SCRIPT:MusicPlayerFile = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'music-player-probe.json'
    $musicProbeFile = $SCRIPT:MusicFile
    $writeLibrary = {
        param($Tracks, [int]$Missing, $Sync, [int]$Volume = 40, [bool]$Shuffle = $false)
        $payload = [ordered]@{
            version = 1
            dir     = 'C:\music'
            volume  = $Volume
            tracks  = $Tracks
            missing = $Missing
            sync    = $Sync
            shuffle = $Shuffle
        }
        [System.IO.File]::WriteAllText($musicProbeFile, ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    }
    # Each case names the track it is already on, which is what a running pet looks
    # like: the library is applied without opening anything, so the probe never builds
    # a media player and never reads a file it does not have.
    $loadFirst = {
        param($Tracks)
        if (@($Tracks).Count -gt 0) {
            $SCRIPT:MusicIndex = 0
            $SCRIPT:MusicCurrentId = [string]$Tracks[0].id
            $SCRIPT:MusicCurrentFile = [string]$Tracks[0].file
        }
    }
    $twoTracks = @(
        [ordered]@{ id = 'BV1'; title = 'Song A'; file = 'C:\music\a.m4a' }
        [ordered]@{ id = 'BV2'; title = 'Song B'; file = 'C:\music\b.m4a' }
    )
    & $writeLibrary $twoTracks 2 ([ordered]@{ running = $false; done = 0; total = 0; current = '' })
    & $loadFirst $twoTracks
    Update-MusicMenu
    [void]$musicProbeLines.Add((@($SCRIPT:MusicMenu.DropDownItems) | ForEach-Object { "$($_.GetType().Name)=$($_.Text)[$($_.Enabled)]" }) -join '|')
    # Playing flips the transport entry and the status line together; both come from
    # this process's own state rather than from the host.
    $SCRIPT:MusicPlaying = $true
    $SCRIPT:MusicStarted = $true
    Update-MusicMenu
    [void]$musicProbeLines.Add((@($SCRIPT:MusicMenu.DropDownItems) | ForEach-Object { "$($_.Text)[$($_.Enabled)]" }) -join '|')
    # A download in flight is a disabled progress line instead of the count.
    $SCRIPT:MusicPlaying = $false
    & $writeLibrary $twoTracks 2 ([ordered]@{ running = $true; done = 1; total = 3; current = 'https://b23.tv/x' })
    & $loadFirst $twoTracks
    Update-MusicMenu
    [void]$musicProbeLines.Add((@($SCRIPT:MusicMenu.DropDownItems) | ForEach-Object { "$($_.Text)[$($_.Enabled)]" }) -join '|')
    # Nothing downloaded at all is the state a machine that just pulled the links
    # starts in, and the state a library with no links starts in.
    & $writeLibrary @() 3 ([ordered]@{ running = $false; done = 0; total = 0; current = '' })
    Update-MusicMenu
    [void]$musicProbeLines.Add((@($SCRIPT:MusicMenu.DropDownItems) | ForEach-Object { "$($_.Text)[$($_.Enabled)]" }) -join '|')
    & $writeLibrary @() 0 ([ordered]@{ running = $false; done = 0; total = 0; current = '' })
    Update-MusicMenu
    [void]$musicProbeLines.Add((@($SCRIPT:MusicMenu.DropDownItems) | ForEach-Object { "$($_.Text)[$($_.Enabled)]" }) -join '|')
    # The host-side entries, fired: each must reach the host as its own command.
    if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
    ($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq $SCRIPT:Labels.MusicOpenDir })[0].PerformClick()
    $musicClicked = Read-Json $probeCommand
    if ($null -eq $musicClicked) { [void]$musicProbeLines.Add('folder=no-command') }
    else { [void]$musicProbeLines.Add("folder=$($musicClicked.command)") }
    & $writeLibrary $twoTracks 2 ([ordered]@{ running = $false; done = 0; total = 0; current = '' })
    & $loadFirst $twoTracks
    Update-MusicMenu
    if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
    ($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq ($SCRIPT:Labels.MusicSyncCount -f 2) })[0].PerformClick()
    $musicClicked = Read-Json $probeCommand
    if ($null -eq $musicClicked) { [void]$musicProbeLines.Add('sync=no-command') }
    else { [void]$musicProbeLines.Add("sync=$($musicClicked.command)") }
    # The volume row is a hosted control rather than an item, so its own rows are
    # printed and the slider is asked for its range and value. The link entry opens a
    # modal box, so it is asserted by its presence and never fired - a probe must not
    # take whatever the clipboard holds.
    & $writeLibrary $twoTracks 2 ([ordered]@{ running = $false; done = 0; total = 0; current = '' }) 25
    & $loadFirst $twoTracks
    Update-MusicMenu
    $volumeItem = @($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq ($SCRIPT:Labels.MusicVolume -f 25) })[0]
    if ($null -eq $volumeItem) { [void]$musicProbeLines.Add('volume=missing') }
    else {
        $rows = @($volumeItem.DropDownItems | ForEach-Object { "$($_.Text)[$($_.Enabled)]" })
        [void]$musicProbeLines.Add("volume=$($rows -join ',')")
    }
    $slider = $SCRIPT:MusicVolumeSlider
    if ($null -eq $slider) { [void]$musicProbeLines.Add('slider=missing') }
    else {
        [void]$musicProbeLines.Add("slider=$($slider.GetType().Name):$($slider.Minimum)-$($slider.Maximum):$($slider.Value):tick=$($slider.TickFrequency)")
    }
    # Moving the slider is what a drag does; the write itself is the timer's job, so
    # the probe calls the commit the way the timer would once the drag has settled.
    if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
    if ($null -ne $slider) {
        $slider.Value = 55
        $SCRIPT:MusicVolumeDueAt = 0
        Update-MusicVolumeCommit
        $musicClicked = Read-Json $probeCommand
        if ($null -eq $musicClicked) { [void]$musicProbeLines.Add('slider=no-command') }
        else { [void]$musicProbeLines.Add("slider-commit=$($musicClicked.command):$($musicClicked.value)") }
        [void]$musicProbeLines.Add("slider-label=$($SCRIPT:MusicVolumeLabel.Text)")
        # A preset is the same route: it moves the slider and the slider's own handler
        # books the write, so the pinning a loop needs is still exercised.
        if (Test-Path -LiteralPath $probeCommand) { Remove-Item -LiteralPath $probeCommand -Force }
        @($volumeItem.DropDownItems | Where-Object { $_.Text -eq '0%' })[0].PerformClick()
        $SCRIPT:MusicVolumeDueAt = 0
        Update-MusicVolumeCommit
        $musicClicked = Read-Json $probeCommand
        if ($null -eq $musicClicked) { [void]$musicProbeLines.Add('preset=no-command') }
        else { [void]$musicProbeLines.Add("preset-commit=$($musicClicked.command):$($musicClicked.value)") }
    }
    # Shuffled, the next song is drawn rather than stepped to, and never the one already
    # playing; unshuffled the same presses walk the list in order. The picker is read
    # rather than played, so no media player is built here.
    & $writeLibrary $twoTracks 0 ([ordered]@{ running = $false; done = 0; total = 0; current = '' }) 40 $true
    & $loadFirst $twoTracks
    # The tick reads the library before it steps, so the probe does too: without it the
    # shuffle flag would still be the one the previous case left behind.
    $null = Read-MusicLibrary
    $shuffleRead = $SCRIPT:MusicShuffle
    $SCRIPT:MusicIndex = 0
    $first = Get-StepMusicIndex 1
    $SCRIPT:MusicIndex = $first
    $second = Get-StepMusicIndex 1
    $shuffleText = if ($shuffleRead) { 'on' } else { 'off' }
    $shuffleChanged = ($first -ne 0 -and $second -ne $first)
    [void]$musicProbeLines.Add("shuffle=read=${shuffleText}:$first,$second changed=$shuffleChanged")
    & $writeLibrary $twoTracks 0 ([ordered]@{ running = $false; done = 0; total = 0; current = '' })
    & $loadFirst $twoTracks
    $SCRIPT:MusicIndex = 0
    $forward = Get-StepMusicIndex 1
    $SCRIPT:MusicIndex = $forward
    [void]$musicProbeLines.Add("order=$forward,$(Get-StepMusicIndex -1)")
    # A chosen picture adds the one row that goes back to the desktop wallpaper: that
    # row is built from what the host published, so it exists exactly while a picture
    # is chosen, and the row for choosing one is there either way.
    $SCRIPT:StageImage = 'C:\pics\wall.png'
    Update-MusicMenu
    $stageClearRow = @($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq $SCRIPT:Labels.StageImageClear })
    $stageClearText = if ($stageClearRow.Count -eq 1) {
        "clear=rows=1 icon=$($stageClearRow[0].Tag):$($stageClearRow[0].Enabled)"
    } else { "clear=rows=$($stageClearRow.Count)" }
    $stagePickRows = @($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq $SCRIPT:Labels.StageImage }).Count
    $SCRIPT:StageImage = ''
    Update-MusicMenu
    $stageBackRows = @($SCRIPT:MusicMenu.DropDownItems | Where-Object { $_.Text -eq $SCRIPT:Labels.StageImageClear }).Count
    $stageProbe = "pick=rows=$stagePickRows $stageClearText back=rows=$stageBackRows"
    $SCRIPT:MusicMenu.Dispose()
    $SCRIPT:MusicMenu = $null
    $SCRIPT:MusicLibrary = $null
    $SCRIPT:MusicTracks = @()
    $SCRIPT:MusicIndex = -1
    $SCRIPT:MusicCurrentId = ''
    $SCRIPT:MusicCurrentFile = ''
    $SCRIPT:MusicStarted = $false
    $SCRIPT:MusicPlaying = $false
    Remove-Item -LiteralPath $musicProbeFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $SCRIPT:MusicPlayerFile -Force -ErrorAction SilentlyContinue
    Write-Output "music-menu: $($musicProbeLines -join ' >> ')"
    Write-Output "stage-image: $stageProbe"
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
    # The preview decides how much of the capture is shown before the file exists: a
    # small one is drawn at its own size, a large one shrinks to the screen it came
    # from, and the labels below it stay inside that screen either way.
    $previewBig = Get-ShotPreviewLayout 4000 3000 ([System.Drawing.Rectangle]::new(0, 0, 1920, 1080))
    $previewSmall = Get-ShotPreviewLayout 320 200 ([System.Drawing.Rectangle]::new(0, 0, 1920, 1080))
    Write-Output ("shot-preview: big={0}x{1} small={2}x{3}" -f $previewBig.ImageWidth, $previewBig.ImageHeight,
        $previewSmall.ImageWidth, $previewSmall.ImageHeight)
    # How that picture moves inside the frame: fitted at 1x, twice the size at 2x, and
    # a pan that stops at the edge rather than sliding the capture off its mat.
    $zoomFont = Get-QuickAccessFont 9 $false
    try { $zoomMetrics = Get-ShotPreviewMetrics 320 200 $zoomFont } finally { $zoomFont.Dispose() }
    $zoomBitmap = New-Object System.Drawing.Bitmap(320, 200)
    try {
        $fitted = Get-ShotPreviewDrawRect $zoomMetrics $zoomBitmap 1.0 ([System.Drawing.Point]::Empty)
        $doubled = Get-ShotPreviewDrawRect $zoomMetrics $zoomBitmap 2.0 ([System.Drawing.Point]::Empty)
        $clamped = Set-ShotPreviewOffset $zoomMetrics 2.0 ([System.Drawing.Point]::new(999, 999))
        Write-Output ("shot-preview-zoom: fit={0}x{1} double={2}x{3} clamp={4},{5}" -f
            $fitted.Width, $fitted.Height, $doubled.Width, $doubled.Height, $clamped.X, $clamped.Y)
        # And what the buttons would write: the frame in the capture's own pixels,
        # fitted it is the whole capture, panned and zoomed it is that smaller part.
        $fitCrop = Get-ShotPreviewSourceRect $zoomMetrics $zoomBitmap 1.0 ([System.Drawing.Point]::Empty)
        $panCrop = Get-ShotPreviewSourceRect $zoomMetrics $zoomBitmap 2.0 ([System.Drawing.Point]::new(-40, -24))
        Write-Output ("shot-preview-crop: fit={0},{1} {2}x{3} pan={4},{5} {6}x{7}" -f
            $fitCrop.X, $fitCrop.Y, $fitCrop.Width, $fitCrop.Height,
            $panCrop.X, $panCrop.Y, $panCrop.Width, $panCrop.Height)
        # And that the capture really comes out at that size: the save path clones the
        # rectangle rather than scaling the whole picture, so this is what it writes.
        $cropped = $zoomBitmap.Clone($panCrop, $zoomBitmap.PixelFormat)
        try {
            Write-Output "shot-preview-crop-pixels: $($cropped.Width)x$($cropped.Height)"
        } finally {
            $cropped.Dispose()
        }
    } finally {
        $zoomBitmap.Dispose()
    }
    # The nine tiles are filled from the eight folders the person assigned and a
    # directory the page names, so the mapping is what a quiet bug would get wrong:
    # the middle slot is the Session's folder whatever the list says, a ring entry
    # that is blank stays an empty tile in its own place, and an entry keeps the
    # folder the person gave it even when it repeats another entry or the Session's
    # own folder.
    $probeFolders = @('C:\a', '', 'C:\c', 'C:\a', '', '', 'C:\b', 'C:\d')
    $probeSlots = Format-QuickAccessSlots $probeFolders 'C:\b'
    $probeText = @(0..8 | ForEach-Object {
        $slot = $probeSlots[$_]
        if ($null -eq $slot) { 'empty' }
        elseif ($slot.Main) { "main=$($slot.Name)" }
        else { $slot.Name }
    })
    Write-Output "quick-access: $($probeText -join ',')"
    # The list itself, kept beside the state file: eight entries in the order the
    # tiles take them, and a slot the person cleared stays cleared.
    $SCRIPT:QuickAccessUser = Read-QuickAccessFolders
    $SCRIPT:QuickAccessUser[0] = 'C:\one'
    $SCRIPT:QuickAccessUser[2] = 'C:\three'
    $SCRIPT:QuickAccessUser[7] = 'C:\eight'
    Save-QuickAccessFolders
    $SCRIPT:QuickAccessUser = $null
    $reloaded = Get-QuickAccessUser
    Write-Output ("quick-access-user: " + (@(0..7 | ForEach-Object {
        if ([string]::IsNullOrEmpty([string]$reloaded[$_])) { 'blank' } else { [string]$reloaded[$_] }
    }) -join ','))
    # The panel itself, drawn offscreen: no window opens, and the tiles are filled
    # with paths long enough to be trimmed, which is the layout a quiet bug would
    # ruin without anything here failing.
    $SCRIPT:QuickAccessScale = 1.0
    $SCRIPT:QuickAccessTiles = Get-QuickAccessTiles 1.0
    $SCRIPT:QuickAccessSlots = Format-QuickAccessSlots @(
        'C:\Users\someone\Documents\A folder name long enough to be trimmed',
        'D:\Work\tmp', 'E:\Unreal\Projects\MyProject_5_8', 'D:\Unreal\resources',
        'E:\AI\3dMax\Save\Quinn', 'E:\AI\Blender', 'E:\AI\DSH', 'E:\Work\SSMainline'
    ) 'E:\AI\DSH'
    $SCRIPT:QuickAccessOpen = @{ 'd:\work\tmp' = [IntPtr]::Zero; 'e:\ai\dsh' = [IntPtr]::Zero }
    $SCRIPT:QuickAccessHover = 1
    $SCRIPT:QuickAccessFocus = 4
    $panelPath = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'quick-access-probe.png'
    Write-QuickAccessProbe $panelPath
    Write-Output "quick-access-panel: $panelPath"
    # And the state a machine is in before DSH has shown a Session: two folders
    # to offer and nothing to pin, so the middle tile has to say so rather than
    # sit blank, and the ring's spare tiles stay empty rather than repeat the
    # message.
    $SCRIPT:QuickAccessSlots = Format-QuickAccessSlots @('D:\Work\tmp', 'E:\AI\3dMax\Save\Quinn') ''
    $SCRIPT:QuickAccessOpen = @{}
    $SCRIPT:QuickAccessHover = -1
    $SCRIPT:QuickAccessFocus = 0
    $sparsePath = Join-Path ([System.IO.Path]::GetDirectoryName($SCRIPT:StateFile)) 'quick-access-probe-sparse.png'
    Write-QuickAccessProbe $sparsePath
    Write-Output "quick-access-panel-sparse: $sparsePath"
    # The one shell question the panel asks, answered for real: how many folder
    # windows are open right now, which is what tells an open tile from one that is
    # not. Whatever this machine has is the answer.
    $quickWindows = Get-ExplorerWindows
    Write-Output "quick-access-windows: $($quickWindows.Count)"
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
    # The same anchor selects the settings tool a restart from the menu has to run
    # before replaying the launcher's command line.
    Write-Output "settings-sync: $(Get-SettingsSyncScript $buildCommand)"
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($RecordProbe)) {
    # The recorder on its own: gdigrab, x264, the stop request, and a file. No
    # sheet, no bar, and no notice are involved, so a machine whose ffmpeg cannot
    # grab the screen fails here instead of at the first menu click. A machine
    # without ffmpeg is not a failure: the recorder is an optional download.
    if ([string]::IsNullOrWhiteSpace((Find-FfmpegDir))) {
        Write-Output 'record-probe: skipped no-ffmpeg'
        exit 0
    }
    $recordProbePath = [System.IO.Path]::GetFullPath($RecordProbe)
    $recordProbeDir = [System.IO.Path]::GetDirectoryName($recordProbePath)
    if (-not (Test-Path -LiteralPath $recordProbeDir)) { [void][System.IO.Directory]::CreateDirectory($recordProbeDir) }
    $recordProbeArea = Get-RecordRectangle ([System.Drawing.Point]::new(0, 0)) ([System.Drawing.Point]::new(319, 199)) `
        ([System.Windows.Forms.SystemInformation]::VirtualScreen)
    $recordProbeProcess = $null
    try {
        $recordProbeProcess = Start-RecordProcess $recordProbeArea $recordProbePath
        Start-Sleep -Seconds 2
        if ($recordProbeProcess.HasExited) {
            Write-Output "record-probe: failed exit=$($recordProbeProcess.ExitCode)"
            $recordProbeProcess.Dispose()
            exit 1
        }
        $recordProbeCode = Stop-RecordProcess $recordProbeProcess
        $recordProbeProcess.Dispose()
    } catch {
        if ($null -ne $recordProbeProcess) { try { $recordProbeProcess.Dispose() } catch { } }
        Write-Output "record-probe: failed $($_.Exception.Message)"
        exit 1
    }
    if (-not (Test-RecordFile $recordProbePath)) {
        Write-Output "record-probe: failed empty exit=$recordProbeCode"
        exit 1
    }
    Write-Output "record-probe: $recordProbePath"
    Write-Output "record-probe-bytes: $((Get-Item -LiteralPath $recordProbePath).Length)"
    Write-Output "record-probe-exit: $recordProbeCode"
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

if (-not [string]::IsNullOrWhiteSpace($MusicProbe)) {
    # The audio path on its own: the media player, the decoder, the sound device, and
    # one file, with no window and no menu. The library is filled in directly, so the
    # same Open-MusicTrack the menu uses is what runs here, and the playback state it
    # writes goes to a scratch file: a diagnostic must not overwrite what a running
    # pet would resume from.
    $SCRIPT:MusicPlayerFile = Join-Path $env:TEMP 'dsh-little-icon-music-probe.json'
    $SCRIPT:MusicTracks = @([pscustomobject]@{ Id = 'probe'; Title = 'probe'; File = $MusicProbe })
    Set-MusicVolume 0
    Open-MusicTrack 0 $true 0
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (-not $SCRIPT:MusicOpened -and $SCRIPT:MusicError -eq '' -and [DateTime]::UtcNow -lt $deadline) {
        $probeFrame = New-Object System.Windows.Threading.DispatcherFrame
        $probeTimer = New-Object System.Windows.Threading.DispatcherTimer
        $probeTimer.Interval = [TimeSpan]::FromMilliseconds(200)
        $probeTimer.Add_Tick({ $probeFrame.Continue = $false; $probeTimer.Stop() })
        $probeTimer.Start()
        [System.Windows.Threading.Dispatcher]::PushFrame($probeFrame)
    }
    if ($SCRIPT:MusicOpened) {
        $duration = ''
        try {
            if ($SCRIPT:Music.NaturalDuration.HasTimeSpan) { $duration = $SCRIPT:Music.NaturalDuration.TimeSpan.ToString() }
        } catch { }
        Write-Output "music-probe: opened duration=$duration"
        try { $SCRIPT:Music.Pause() } catch { }
        Remove-Item -LiteralPath $SCRIPT:MusicPlayerFile -Force -ErrorAction SilentlyContinue
        exit 0
    }
    Write-Output "music-probe: failed error=$SCRIPT:MusicError"
    Remove-Item -LiteralPath $SCRIPT:MusicPlayerFile -Force -ErrorAction SilentlyContinue
    exit 1
}

if ($AudioProbe) {
    # What Windows says about the default output device's audio sessions, printed
    # rather than acted on: the probe that steps the music aside reads exactly this,
    # so a machine can be checked for what it sees before anything is decided from
    # it. A session that is open but silent reports 0.000, and this process's own
    # session is marked so what the probe excludes is visible.
    if (-not (Initialize-AudioSessions)) {
        Write-Output 'audio-probe: unavailable'
        exit 1
    }
    $probePeak = [double][DshPet.AudioSessions]::MaxOtherPeak($PID)
    Write-Output "audio-probe-own-pid: $PID"
    Write-Output ("audio-probe-max-other: " + $probePeak.ToString('0.000', [System.Globalization.CultureInfo]::InvariantCulture))
    foreach ($probeLine in ([DshPet.AudioSessions]::Describe($PID) -split "`n")) {
        if (-not [string]::IsNullOrWhiteSpace($probeLine)) { Write-Output "audio-probe-session: $probeLine" }
    }
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
[System.Runtime.InteropServices.DllImport("gdi32.dll")] public static extern System.IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int width, int height);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int SetWindowRgn(System.IntPtr hWnd, System.IntPtr region, bool redraw);
[System.Runtime.InteropServices.DllImport("gdi32.dll")] public static extern bool DeleteObject(System.IntPtr handle);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr SetActiveWindow(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, System.UIntPtr extra);
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
    $previous = $SCRIPT:Expression
    $SCRIPT:Expression = $State
    $SCRIPT:FrameIndex = 1
    $SCRIPT:LastFrameAt = [Environment]::TickCount
    $SCRIPT:FrameCount = [Math]::Max(1, (Get-FrameCount $State))
    Show-CurrentFrame
    # A look at the pet is not available to somebody working in another window, so
    # the step into "waiting for you" also speaks: once per question, not per tick.
    if (Test-ShouldAnnounceAlert $previous $State $SCRIPT:AlertNotice) { Show-AlertNotice }
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
    if ($null -ne $State.alertNotice) { $SCRIPT:AlertNotice = [bool]$State.alertNotice }
    if ($null -ne $State.size) { Set-PetSize ([int]$State.size) }
    if ($null -ne $State.topmost) { $window.Topmost = [bool]$State.topmost }
    if ($null -ne $State.state) { Set-Expression ([string]$State.state) }
    # Where captures go: the settings may name a directory, and a blank one is the
    # default beside the state file.
    $SCRIPT:ShotDir = Select-ShotDir $State
    # Where recordings go: the same rule, over the folder the settings card names.
    # A blank setting arrives as no field at all, so the pet keeps its own folder.
    $SCRIPT:RecordDir = Select-RecordDir $State
    # Where the clip window starts: the folder the settings card names, or blank to
    # keep whatever that window remembered from its own last download.
    if ($null -ne $State.videoClipDir) { $SCRIPT:VideoClipDir = [string]$State.videoClipDir }
    # The host asks for a tuck once the user has left DSH untouched long enough;
    # the request says nothing about the current window state, so it only ever
    # hides, and hiding an already hidden window is a no-op.
    if ($null -ne $State.tuck -and [bool]$State.tuck) { Set-DshWindowShown $false }
    # The folder the DSH window is showing: the page names it, and the quick
    # access panel pins it in the middle of its tiles. A panel already open
    # follows the change, so switching Session in DSH updates it under the
    # pointer instead of leaving yesterday's folder in the middle.
    $reportedCwd = if ($null -eq $State.cwd) { '' } else { [string]$State.cwd }
    if ($reportedCwd -ne $SCRIPT:MainCwd) {
        $SCRIPT:MainCwd = $reportedCwd
        if ($null -ne $SCRIPT:QuickAccess) { Update-QuickAccessPanel }
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

function Get-DshInFront {
    # The click's own question, and deliberately stricter than Get-DshForeground:
    # what decides whether a click tucks DSH away is whether DSH itself is the
    # window in front. The pet's own window does not count, because the press that
    # makes the click activates the pet - counting it, the way the host's auto-tuck
    # question must, would answer "in front" for every click and the pet could never
    # tuck DSH away again. Measured on the click's behalf before it happens, never
    # during it.
    $handle = [DshPet.Win32]::GetForegroundWindow()
    if ($handle -eq [IntPtr]::Zero) { return $false }
    $owner = 0
    [void][DshPet.Win32]::GetWindowThreadProcessId($handle, [ref]$owner)
    return ($owner -eq $SCRIPT:DshPid)
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
    # Taken here rather than at the click, which arrives after the press has already
    # made the pet the foreground window. The early return below skips the file
    # write, not this sample, because a click needs it fresh even when nothing the
    # host reads has moved.
    $SCRIPT:DshInFront = Get-DshInFront
    if ($visible -eq $SCRIPT:WindowVisible -and $foreground -eq $SCRIPT:WindowForeground) { return }
    $SCRIPT:WindowVisible = $visible
    $SCRIPT:WindowForeground = $foreground
    Write-Json $SCRIPT:WindowFile ([ordered]@{ dshVisible = $visible; dshForeground = $foreground })
}

function Invoke-PetClick {
    switch ($SCRIPT:ClickAction) {
        'toggle' {
            # A click hides only a DSH that is already in front; one that is merely
            # behind another application is brought forward, and one that is away is
            # restored, so the click always means "let me look at DSH".
            if ((Get-ClickIntent (Get-DshShown) $SCRIPT:DshInFront) -eq 'hide') { Set-DshWindowShown $false }
            else { Show-DshWindow }
        }
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
# The hole the sheet's region was last cut with: Empty means the whole window. Re-
# applying the region it already has costs a full-window recompute on every mouse
# move, which is exactly what a drag cannot afford.
$SCRIPT:ShotHole = [System.Drawing.Rectangle]::Empty
# The preview between the shutter and the file: the bitmap lives here while that
# window is open, because choosing is what writes it.
$SCRIPT:ShotPreview = $null
$SCRIPT:ShotPreviewChoice = ''
$SCRIPT:ShotPreviewBitmap = $null
$SCRIPT:ShotPreviewPath = ''
$SCRIPT:ShotPreviewMetrics = $null
$SCRIPT:ShotPreviewHover = -1
$SCRIPT:ShotPreviewPressed = -1
$SCRIPT:ShotPreviewDragging = $false
$SCRIPT:ShotPreviewDragStart = [System.Drawing.Point]::Empty
$SCRIPT:ShotPreviewWindowStart = [System.Drawing.Point]::Empty
$SCRIPT:ShotPreviewZoom = 1.0
$SCRIPT:ShotPreviewMaxZoom = 1.0
$SCRIPT:ShotPreviewOffset = [System.Drawing.Point]::Empty
$SCRIPT:ShotPreviewPanning = $false
$SCRIPT:ShotPreviewPanStart = [System.Drawing.Point]::Empty
$SCRIPT:ShotPreviewPanOrigin = [System.Drawing.Point]::Empty

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
    # through unmodified. A recording's frame is dragged from the inside, and a
    # hole would take those presses away from this window, so the recording sheet
    # stays whole and dims its entire surface instead of cutting the frame out.
    $hole = if ($SCRIPT:ShotMode -ne 'record' -and $Selection.Width -gt 0 -and $Selection.Height -gt 0) {
        $Selection
    } else {
        [System.Drawing.Rectangle]::Empty
    }
    if ($hole -eq $SCRIPT:ShotHole) { return }
    $region = [System.Drawing.Region]::new([System.Drawing.Rectangle]::new(0, 0, $Form.ClientSize.Width, $Form.ClientSize.Height))
    if ($hole.Width -gt 0 -and $hole.Height -gt 0) { $region.Exclude($hole) }
    $previous = $Form.Region
    $Form.Region = $region
    $SCRIPT:ShotHole = $hole
    if ($null -ne $previous) { $previous.Dispose() }
}

function Close-ShotOverlay {
    $form = $SCRIPT:ShotOverlay
    $SCRIPT:ShotOverlay = $null
    $SCRIPT:ShotDragging = $false
    $SCRIPT:RecordStage = ''
    $SCRIPT:RecordHandle = -1
    $SCRIPT:RecordFrame = [System.Drawing.Rectangle]::Empty
    $SCRIPT:ShotHole = [System.Drawing.Rectangle]::Empty
    # The start window belongs to the sheet, so it goes with it.
    try { Close-RecordFrameBar } catch { }
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

function Show-AlertNotice {
    # The face is the signal for somebody already looking at the pet; a short sound
    # and the notice box are for somebody who is not. A sound the system has muted
    # is not a failure, so one that cannot play is logged and the notice still shows.
    try {
        [System.Media.SystemSounds]::Asterisk.Play()
    } catch {
        Write-Log "playing the alert sound failed: $($_.Exception.Message)"
    }
    Show-PetNotice $SCRIPT:Labels.PetName $SCRIPT:Labels.AlertNotice
}

function Close-ShotPreview {
    # Closing performs the choice: the window's FormClosed handler reads it, writes
    # the file or the clipboard, and disposes the bitmap. Replacing a preview that
    # is still open closes it the same way.
    $form = $SCRIPT:ShotPreview
    $SCRIPT:ShotPreview = $null
    if ($null -ne $form) {
        try { $form.Close() } catch { }
    }
}

function Get-ShotPreviewHit($Metrics, [System.Drawing.Point]$Point) {
    if ($Metrics.SaveRect.Contains($Point)) { return 0 }
    if ($Metrics.CopyRect.Contains($Point)) { return 1 }
    if ($Metrics.CancelRect.Contains($Point)) { return 2 }
    if ($Metrics.CloseRect.Contains($Point)) { return 3 }
    return -1
}

function Get-ShotPreviewHitRect($Metrics, [int]$Hit) {
    switch ($Hit) {
        0 { return $Metrics.SaveRect }
        1 { return $Metrics.CopyRect }
        2 { return $Metrics.CancelRect }
        3 { return $Metrics.CloseRect }
        default { return [System.Drawing.Rectangle]::Empty }
    }
}

function Invoke-ShotPreviewChoice([int]$Hit) {
    # The window performs the choice it was closed with, so a click, Enter, and
    # Escape all reach the same path.
    switch ($Hit) {
        0 { $SCRIPT:ShotPreviewChoice = 'save' }
        1 { $SCRIPT:ShotPreviewChoice = 'copy' }
        default { $SCRIPT:ShotPreviewChoice = '' }
    }
    Close-ShotPreview
}

function New-ShotPreviewForm($Bitmap, [System.Drawing.Rectangle]$Shot) {
    # Builds the window a capture is confirmed in - the picture, its size, the file
    # it would become, and the three buttons - and returns it plus the boxes it was
    # laid out from, so the probe can draw the same window off screen.
    $area = [System.Windows.Forms.Screen]::FromRectangle($Shot).WorkingArea
    $layout = Get-ShotPreviewLayout $Bitmap.Width $Bitmap.Height $area
    $font = Get-QuickAccessFont 9 $false
    try { $metrics = Get-ShotPreviewMetrics $layout.ImageWidth $layout.ImageHeight $font }
    finally { $font.Dispose() }

    $form = New-Object DshPet.ShotPreviewForm
    $form.Text = $SCRIPT:Labels.ShotPreviewTitle
    # No stock chrome: the window is drawn whole, and the region carries its rounded
    # corners. FixedDialog would put a title bar over a hand-drawn surface.
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    # Physical pixels, like the sheet: the layout is computed from the capture and
    # the screen, so an automatic font scale would move the buttons off it.
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $form.ShowInTaskbar = $false
    $form.TopMost = $true
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
    $form.KeyPreview = $true
    $form.ClientSize = New-Object System.Drawing.Size($metrics.Width, $metrics.Height)
    Set-QuickAccessRegion $form ([int][Math]::Round(16 * $metrics.Scale))

    # Over the selection that produced it, and inside the working area when that
    # selection is too small or too close to an edge to hold the window.
    $left = $Shot.Left + [int](($Shot.Width - $form.Width) / 2)
    $top = $Shot.Top + [int](($Shot.Height - $form.Height) / 2)
    $left = [Math]::Min([Math]::Max($left, $area.Left + 8), [Math]::Max($area.Left + 8, $area.Right - $form.Width - 8))
    $top = [Math]::Min([Math]::Max($top, $area.Top + 8), [Math]::Max($area.Top + 8, $area.Bottom - $form.Height - 8))
    $form.Location = New-Object System.Drawing.Point($left, $top)

    return [pscustomobject]@{
        Form    = $form
        Metrics = $metrics
    }
}

function Show-ShotPreview($Bitmap, [System.Drawing.Rectangle]$Shot) {
    # The shutter no longer writes on release: the preview owns the bitmap and
    # writes the file only after Save, so a capture the person backs out of leaves
    # no file.
    if ($null -ne $SCRIPT:ShotPreview) {
        try { $SCRIPT:ShotPreview.Close() } catch { }
        $SCRIPT:ShotPreview = $null
    }
    # Named before the window is built, because the window says where the file
    # would go. The folder is not created here: a cancelled capture leaves nothing.
    $SCRIPT:ShotPreviewPath = Get-ShotFileName
    $SCRIPT:ShotPreviewBitmap = $Bitmap
    $SCRIPT:ShotPreviewChoice = ''
    $built = New-ShotPreviewForm $Bitmap $Shot
    $form = $built.Form
    $SCRIPT:ShotPreviewMetrics = $built.Metrics
    $SCRIPT:ShotPreviewHover = -1
    $SCRIPT:ShotPreviewPressed = -1
    $SCRIPT:ShotPreviewDragging = $false
    # The picture is shown fitted; the wheel zooms it and a drag pans it, up to its
    # own pixels at 1:1, and twice the fitted size for one the frame already shows whole.
    $SCRIPT:ShotPreviewZoom = 1.0
    $SCRIPT:ShotPreviewOffset = [System.Drawing.Point]::Empty
    $SCRIPT:ShotPreviewPanning = $false
    $SCRIPT:ShotPreviewPanStart = [System.Drawing.Point]::Empty
    $SCRIPT:ShotPreviewPanOrigin = [System.Drawing.Point]::Empty
    $baseScale = $built.Metrics.ImageRect.Width / [double]$Bitmap.Width
    # Up to 1:1 pixels, so a large capture can be read at its own resolution; a small
    # one stops at twice the fitted size, past which only interpolation remains.
    $SCRIPT:ShotPreviewMaxZoom = [Math]::Max(2.0, 1.0 / $baseScale)
    $SCRIPT:ShotPreview = $form

    $form.add_Paint({
        param($sender, $eventArgs)
        try {
            if ($null -eq $SCRIPT:ShotPreviewBitmap) { return }
            Draw-ShotPreview $eventArgs.Graphics $SCRIPT:ShotPreviewMetrics $SCRIPT:ShotPreviewBitmap `
                $SCRIPT:ShotPreviewPath $SCRIPT:ShotPreviewHover $SCRIPT:ShotPreviewPressed `
                $SCRIPT:ShotPreviewZoom $SCRIPT:ShotPreviewOffset
        } catch {
            Write-Log "drawing the capture preview failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseMove({
        param($sender, $eventArgs)
        try {
            if ($SCRIPT:ShotPreviewDragging) {
                $position = [System.Windows.Forms.Cursor]::Position
                $sender.Location = New-Object System.Drawing.Point(
                    ($SCRIPT:ShotPreviewWindowStart.X + $position.X - $SCRIPT:ShotPreviewDragStart.X),
                    ($SCRIPT:ShotPreviewWindowStart.Y + $position.Y - $SCRIPT:ShotPreviewDragStart.Y))
                return
            }
            if ($SCRIPT:ShotPreviewPanning) {
                $deltaX = $eventArgs.X - $SCRIPT:ShotPreviewPanStart.X
                $deltaY = $eventArgs.Y - $SCRIPT:ShotPreviewPanStart.Y
                $SCRIPT:ShotPreviewOffset = Set-ShotPreviewOffset $SCRIPT:ShotPreviewMetrics $SCRIPT:ShotPreviewZoom `
                    ([System.Drawing.Point]::new(($SCRIPT:ShotPreviewPanOrigin.X + $deltaX), ($SCRIPT:ShotPreviewPanOrigin.Y + $deltaY)))
                $sender.Invalidate($SCRIPT:ShotPreviewMetrics.ImageRect)
                return
            }
            $hit = Get-ShotPreviewHit $SCRIPT:ShotPreviewMetrics $eventArgs.Location
            if ($hit -ne $SCRIPT:ShotPreviewHover) {
                $previous = $SCRIPT:ShotPreviewHover
                $SCRIPT:ShotPreviewHover = $hit
                if ($previous -ge 0) { $sender.Invalidate((Get-ShotPreviewHitRect $SCRIPT:ShotPreviewMetrics $previous)) }
                if ($hit -ge 0) { $sender.Invalidate((Get-ShotPreviewHitRect $SCRIPT:ShotPreviewMetrics $hit)) }
            }
            if ($hit -ge 0) {
                $sender.Cursor = [System.Windows.Forms.Cursors]::Hand
            } elseif ($SCRIPT:ShotPreviewMetrics.ImageRect.Contains($eventArgs.Location) -and
                $SCRIPT:ShotPreviewZoom -gt 1.0001) {
                $sender.Cursor = [System.Windows.Forms.Cursors]::SizeAll
            } elseif ($eventArgs.Y -lt $SCRIPT:ShotPreviewMetrics.TitleHeight) {
                $sender.Cursor = [System.Windows.Forms.Cursors]::SizeAll
            } else {
                $sender.Cursor = [System.Windows.Forms.Cursors]::Default
            }
        } catch {
            Write-Log "tracking the pointer over the preview failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseDown({
        param($sender, $eventArgs)
        if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
        $hit = Get-ShotPreviewHit $SCRIPT:ShotPreviewMetrics $eventArgs.Location
        if ($hit -ge 0) {
            $SCRIPT:ShotPreviewPressed = $hit
            $sender.Invalidate((Get-ShotPreviewHitRect $SCRIPT:ShotPreviewMetrics $hit))
            return
        }
        if ($SCRIPT:ShotPreviewZoom -gt 1.0001 -and
            $SCRIPT:ShotPreviewMetrics.ImageRect.Contains($eventArgs.Location)) {
            $SCRIPT:ShotPreviewPanning = $true
            $SCRIPT:ShotPreviewPanStart = $eventArgs.Location
            $SCRIPT:ShotPreviewPanOrigin = $SCRIPT:ShotPreviewOffset
            $sender.Cursor = [System.Windows.Forms.Cursors]::SizeAll
            return
        }
        if ($eventArgs.Y -lt $SCRIPT:ShotPreviewMetrics.TitleHeight) {
            $SCRIPT:ShotPreviewDragging = $true
            $SCRIPT:ShotPreviewDragStart = [System.Windows.Forms.Cursor]::Position
            $SCRIPT:ShotPreviewWindowStart = $sender.Location
            $sender.Cursor = [System.Windows.Forms.Cursors]::SizeAll
        }
    })
    $form.add_MouseUp({
        param($sender, $eventArgs)
        if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
        $SCRIPT:ShotPreviewDragging = $false
        $SCRIPT:ShotPreviewPanning = $false
        $pressed = $SCRIPT:ShotPreviewPressed
        $SCRIPT:ShotPreviewPressed = -1
        if ($pressed -lt 0) { return }
        $sender.Invalidate((Get-ShotPreviewHitRect $SCRIPT:ShotPreviewMetrics $pressed))
        $hit = Get-ShotPreviewHit $SCRIPT:ShotPreviewMetrics $eventArgs.Location
        if ($hit -eq $pressed) { Invoke-ShotPreviewChoice $pressed }
    })
    $form.add_MouseWheel({
        param($sender, $eventArgs)
        try {
            $metrics = $SCRIPT:ShotPreviewMetrics
            if ($null -eq $metrics -or $null -eq $SCRIPT:ShotPreviewBitmap) { return }
            if (-not $metrics.ImageRect.Contains($eventArgs.Location)) { return }
            $oldZoom = $SCRIPT:ShotPreviewZoom
            $factor = 1.15
            if ($eventArgs.Delta -lt 0) { $factor = 1 / 1.15 }
            $newZoom = [Math]::Min($SCRIPT:ShotPreviewMaxZoom, [Math]::Max(1.0, $oldZoom * $factor))
            if ([Math]::Abs($newZoom - $oldZoom) -lt 0.0001) { return }
            # The point under the pointer stays under it, so zooming into a corner is
            # how a detail gets looked at without hunting for it again.
            $centerX = $metrics.ImageRect.Width / 2.0
            $centerY = $metrics.ImageRect.Height / 2.0
            $pointerX = $eventArgs.X - $metrics.ImageRect.Left
            $pointerY = $eventArgs.Y - $metrics.ImageRect.Top
            $unitX = ($pointerX - $centerX - $SCRIPT:ShotPreviewOffset.X) / ($metrics.ImageRect.Width * $oldZoom)
            $unitY = ($pointerY - $centerY - $SCRIPT:ShotPreviewOffset.Y) / ($metrics.ImageRect.Height * $oldZoom)
            $offsetX = $pointerX - $centerX - $unitX * $metrics.ImageRect.Width * $newZoom
            $offsetY = $pointerY - $centerY - $unitY * $metrics.ImageRect.Height * $newZoom
            $SCRIPT:ShotPreviewZoom = $newZoom
            $SCRIPT:ShotPreviewOffset = Set-ShotPreviewOffset $metrics $newZoom `
                ([System.Drawing.Point]::new([int][Math]::Round($offsetX), [int][Math]::Round($offsetY)))
            $sender.Invalidate($metrics.ImageRect)
        } catch {
            Write-Log "zooming the capture preview failed: $($_.Exception.Message)"
        }
    })
    $form.add_DoubleClick({
        param($sender, $eventArgs)
        try {
            $metrics = $SCRIPT:ShotPreviewMetrics
            if ($null -eq $metrics) { return }
            if (-not $metrics.ImageRect.Contains($eventArgs.Location)) { return }
            # A double click is the whole picture and its largest zoom, nothing in
            # between: the wheel is for the sizes between.
            if ($SCRIPT:ShotPreviewZoom -gt 1.0001) { $SCRIPT:ShotPreviewZoom = 1.0 }
            else { $SCRIPT:ShotPreviewZoom = $SCRIPT:ShotPreviewMaxZoom }
            $SCRIPT:ShotPreviewOffset = [System.Drawing.Point]::Empty
            $sender.Invalidate($metrics.ImageRect)
        } catch {
            Write-Log "toggling the capture preview zoom failed: $($_.Exception.Message)"
        }
    })
    $form.add_KeyDown({
        param($sender, $eventArgs)
        if ($eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Return) {
            $eventArgs.Handled = $true
            Invoke-ShotPreviewChoice 0
        } elseif ($eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
            $eventArgs.Handled = $true
            Invoke-ShotPreviewChoice 2
        }
    })

    $form.add_FormClosed({
        param($sender, $eventArgs)
        $choice = $SCRIPT:ShotPreviewChoice
        # Read before the reset: what was on screen decides which pixels the buttons write.
        $zoom = $SCRIPT:ShotPreviewZoom
        $offset = $SCRIPT:ShotPreviewOffset
        $metrics = $SCRIPT:ShotPreviewMetrics
        $SCRIPT:ShotPreviewChoice = ''
        $SCRIPT:ShotPreview = $null
        $SCRIPT:ShotPreviewMetrics = $null
        $SCRIPT:ShotPreviewHover = -1
        $SCRIPT:ShotPreviewPressed = -1
        $SCRIPT:ShotPreviewDragging = $false
        $SCRIPT:ShotPreviewPanning = $false
        $SCRIPT:ShotPreviewZoom = 1.0
        $SCRIPT:ShotPreviewMaxZoom = 1.0
        $SCRIPT:ShotPreviewOffset = [System.Drawing.Point]::Empty
        $bitmap = $SCRIPT:ShotPreviewBitmap
        $SCRIPT:ShotPreviewBitmap = $null
        $path = $SCRIPT:ShotPreviewPath
        $SCRIPT:ShotPreviewPath = ''
        if ($null -eq $bitmap) { return }
        # The frame, not the whole capture: the buttons write the rectangle the person
        # zoomed and panned into view, at the capture's own resolution.
        $frame = $bitmap
        if ($null -ne $metrics) {
            $source = Get-ShotPreviewSourceRect $metrics $bitmap $zoom $offset
            if ($source.X -ne 0 -or $source.Y -ne 0 -or
                $source.Width -ne $bitmap.Width -or $source.Height -ne $bitmap.Height) {
                $frame = $bitmap.Clone($source, $bitmap.PixelFormat)
            }
        }
        try {
            if ($choice -eq 'save') {
                # The folder may still be missing: naming the file must not create
                # it, because a cancelled capture has to leave the folder as it was.
                if (-not (Test-Path -LiteralPath $SCRIPT:ShotDir)) {
                    [void][System.IO.Directory]::CreateDirectory($SCRIPT:ShotDir)
                }
                if ([string]::IsNullOrWhiteSpace($path) -or (Test-Path -LiteralPath $path)) { $path = New-ShotPath }
                Save-ShotBitmap $frame $path
                $copied = Copy-ShotImage $frame
                if ($copied) { Show-PetNotice $SCRIPT:Labels.ShotSaved $path }
                else { Show-PetNotice $SCRIPT:Labels.ShotSavedNoClipboard $path }
            } elseif ($choice -eq 'copy') {
                if (Copy-ShotImage $frame) { Show-PetNotice $SCRIPT:Labels.ShotCopied '' }
                else { Show-ShotFailure $SCRIPT:Labels.ShotCopyFailed }
            }
        } catch {
            Write-Log "saving the capture failed: $($_.Exception.Message)"
            try { Show-ShotFailure $_.Exception.Message } catch { }
        } finally {
            if (-not [object]::ReferenceEquals($frame, $bitmap)) { $frame.Dispose() }
            $bitmap.Dispose()
        }
    })

    $form.Show()
    $form.Activate()
    # The person just finished a drag here, so the window can take the foreground:
    # Enter saves, Escape cancels, and both only reach a window that has the focus.
    [void][DshPet.Win32]::SetForegroundWindow($form.Handle)
    $form.Focus()
}

function Complete-RegionShot($Form, [System.Drawing.Rectangle]$Selection) {
    # This process's own sheet has to be off the screen before the shutter, or the
    # dimming would be in the file. The hole already showed the desktop, so what
    # the person saw inside the selection is what the preview holds. A recording
    # never reaches this: its frame waits for the start button (see Start-RecordFromSheet).
    $shot = [System.Drawing.Rectangle]::new(($Form.Left + $Selection.X), ($Form.Top + $Selection.Y),
        $Selection.Width, $Selection.Height)
    $Form.Hide()
    [System.Windows.Forms.Application]::DoEvents()
    # The hidden window is gone once the system has composed a frame without it;
    # a sleeping dispatcher needs no repaint, so this is the wait that costs.
    Start-Sleep -Milliseconds 90
    $bitmap = New-ScreenShotBitmap $shot
    Close-ShotOverlay
    # Nothing is written here any more: the preview owns the bitmap and writes the
    # file only after Save, so a capture the person backs out of leaves no file.
    try { Show-ShotPreview $bitmap $shot }
    catch {
        $bitmap.Dispose()
        throw
    }
}

function Start-RegionShot([string]$Mode = 'shot') {
    if ($null -ne $SCRIPT:ShotOverlay) { return }
    # One sheet serves both: the capture reads the region it is dragged over, while
    # a recording keeps the region as a frame that can be moved and resized before
    # anything is recorded. The hint is what tells the person which one it is.
    $SCRIPT:ShotMode = $Mode
    $form = New-Object System.Windows.Forms.Form
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    # The virtual screen, so a second monitor is captured like the first.
    $form.Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $form.BackColor = [System.Drawing.Color]::Black
    # A recording's frame is dragged from inside, so that surface has to stay
    # readable: it is dimmed less than a capture's sheet, whose hole shows the
    # desktop unchanged. Everything this window draws is dimmed by the same value,
    # which is why the frame itself is drawn in two tones (see the paint handler)
    # rather than bought with a darker veil.
    $form.Opacity = if ($Mode -eq 'record') { 0.38 } else { 0.35 }
    $form.TopMost = $true
    $form.ShowInTaskbar = $false
    # Escape has to reach this form: it is the way out for a sheet opened by
    # mistake, next to a right-click.
    $form.KeyPreview = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Cross

    $SCRIPT:ShotOverlay = $form
    $SCRIPT:ShotDragging = $false
    $SCRIPT:ShotStart = [System.Drawing.Point]::Empty
    $SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty
    $SCRIPT:ShotHole = [System.Drawing.Rectangle]::Empty
    $SCRIPT:RecordStage = ''
    $SCRIPT:RecordFrame = [System.Drawing.Rectangle]::Empty
    Set-ShotHole $form $SCRIPT:ShotSelection

    $form.add_Paint({
        param($sender, $eventArgs)
        try {
            $graphics = $eventArgs.Graphics
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $font = $null
            $brush = $null
            $pen = $null
            $edgePen = $null
            $plateBrush = $null
            $handleBrush = $null
            $handlePen = $null
            try {
                $font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
                $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 244, 247))
                $primary = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $hintText = if ($SCRIPT:ShotMode -eq 'record') { $SCRIPT:Labels.RecordHint } else { $SCRIPT:Labels.ShotHint }
                $hint = $graphics.MeasureString($hintText, $font)
                $graphics.DrawString($hintText, $font, $brush,
                    (($primary.Left - $sender.Left) + (($primary.Width - $hint.Width) / 2)),
                    (($primary.Top - $sender.Top) + 42))
                $recording = $SCRIPT:ShotMode -eq 'record'
                # A recording's frame only exists once the drag ends, so the drag
                # itself is what is drawn until then: a selection that appears only
                # when the button is released is not a selection anyone can aim.
                $selection = if ($recording) {
                    if ($SCRIPT:ShotDragging -and $SCRIPT:ShotSelection.Width -gt 0 -and $SCRIPT:ShotSelection.Height -gt 0) {
                        $SCRIPT:ShotSelection
                    } else {
                        $SCRIPT:RecordFrame
                    }
                } else {
                    $SCRIPT:ShotSelection
                }
                if ($selection.Width -gt 0 -and $selection.Height -gt 0) {
                    # The sheet is translucent, so everything painted here is mixed
                    # with whatever is behind it: a single thin blue line vanished
                    # into a mid-tone page. A near-black stroke under a bright one
                    # reads on a white page and on a dark desktop alike, and the
                    # frame is drawn just outside the selection so the hole (a
                    # capture's) never clips half of it.
                    $edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(235, 8, 13, 22), 6)
                    $graphics.DrawRectangle($edgePen, ($selection.X - 3), ($selection.Y - 3),
                        ($selection.Width + 5), ($selection.Height + 5))
                    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 132, 186, 255), 3)
                    $graphics.DrawRectangle($pen, ($selection.X - 2), ($selection.Y - 2),
                        ($selection.Width + 3), ($selection.Height + 3))
                    # The size reads on its own plate: the same dimming that fades a
                    # stroke would fade bare glyphs into the desktop.
                    $labelText = '{0} x {1}' -f $selection.Width, $selection.Height
                    $labelSize = $graphics.MeasureString($labelText, $font)
                    $labelX = [Math]::Max(4, $selection.X)
                    $labelY = [Math]::Max(4, ($selection.Y - 10 - $labelSize.Height))
                    $plateBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 12, 17, 25))
                    $graphics.FillRectangle($plateBrush, $labelX, $labelY,
                        ($labelSize.Width + 10), ($labelSize.Height + 2))
                    $graphics.DrawString($labelText, $font, $brush, ($labelX + 5), ($labelY + 1))
                    if ($recording -and $SCRIPT:RecordStage -eq 'adjust') {
                        # Grips are painted outside the hole: anything inside it is
                        # cut away by the window's region and would not be visible.
                        $handleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
                        $handlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 12, 17, 25), 1)
                        foreach ($handle in (Get-RecordFrameHandleBoxes $selection)) {
                            $graphics.FillRectangle($handleBrush, $handle)
                            $graphics.DrawRectangle($handlePen, $handle)
                        }
                    }
                }
            } finally {
                if ($null -ne $handlePen) { $handlePen.Dispose() }
                if ($null -ne $handleBrush) { $handleBrush.Dispose() }
                if ($null -ne $plateBrush) { $plateBrush.Dispose() }
                if ($null -ne $edgePen) { $edgePen.Dispose() }
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
            if ($SCRIPT:ShotMode -eq 'record') { Invoke-RecordSheetDown $sender $eventArgs; return }
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
        try {
            if ($SCRIPT:ShotMode -eq 'record') { Invoke-RecordSheetMove $sender $eventArgs; return }
            if (-not $SCRIPT:ShotDragging) { return }
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
            if ($SCRIPT:ShotMode -eq 'record') { Invoke-RecordSheetUp $sender $eventArgs; return }
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
            # The sheet serves both actions, so the notice has to name the one the
            # person actually chose: a failed recording is not a failed capture.
            $mode = $SCRIPT:ShotMode
            if ($mode -eq 'record') {
                Write-Log "starting the recording failed: $($_.Exception.Message)"
            } else {
                Write-Log "saving the capture failed: $($_.Exception.Message)"
            }
            Close-ShotOverlay
            if ($mode -eq 'record') { try { Show-RecordFailure $_.Exception.Message } catch { } }
            else { try { Show-ShotFailure $_.Exception.Message } catch { } }
        }
    })
    $form.add_Shown({
        param($sender, $eventArgs)
        # The menu that chose this sheet hands the focus back when it closes, and
        # that happens after Show(): asking again once the window is up is what
        # leaves Escape pointing at the sheet instead of nowhere.
        try { $sender.Activate() } catch { }
        try { [void][DshPet.Win32]::SetForegroundWindow($sender.Handle) } catch { }
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

# ---- recording frame on the sheet -------------------------------------------
# A recording does not start on release: the selection becomes a frame with eight
# grips and a draggable middle, the way a window is resized, and a small window
# under it holds the start button. Both belong to the sheet, so closing the sheet
# closes them, and nothing is recorded until the button is pressed.
function Invoke-RecordSheetDown($Form, $EventArgs) {
    if ($EventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
        Close-ShotOverlay
        return
    }
    $point = $EventArgs.Location
    if ($SCRIPT:RecordStage -eq 'adjust') {
        $handle = Get-RecordFrameHandle $SCRIPT:RecordFrame $point
        if ($handle -ge 0) {
            $SCRIPT:RecordStage = 'resize'
            $SCRIPT:RecordHandle = $handle
            $SCRIPT:RecordDragOrigin = $point
            $SCRIPT:RecordFrameOrigin = $SCRIPT:RecordFrame
            $Form.Capture = $true
            return
        }
        if ($SCRIPT:RecordFrame.Contains($point)) {
            $SCRIPT:RecordStage = 'move'
            $SCRIPT:RecordDragOrigin = $point
            $SCRIPT:RecordFrameOrigin = $SCRIPT:RecordFrame
            $Form.Capture = $true
            return
        }
        # A press outside the frame drops it and starts a new selection.
        $SCRIPT:RecordFrame = [System.Drawing.Rectangle]::Empty
        $SCRIPT:RecordStage = ''
        Close-RecordFrameBar
        Set-ShotHole $Form $SCRIPT:RecordFrame
    }
    $SCRIPT:ShotStart = $point
    $SCRIPT:ShotDragging = $true
    $SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty
    $Form.Capture = $true
    $Form.Invalidate()
    $Form.Update()
}

function Invoke-RecordSheetMove($Form, $EventArgs) {
    $point = $EventArgs.Location
    $bounds = [System.Drawing.Rectangle]::new(0, 0, $Form.ClientSize.Width, $Form.ClientSize.Height)
    if ($SCRIPT:RecordStage -eq 'resize') {
        $delta = [System.Drawing.Point]::new(($point.X - $SCRIPT:RecordDragOrigin.X), ($point.Y - $SCRIPT:RecordDragOrigin.Y))
        $SCRIPT:RecordFrame = Resize-RecordFrame $SCRIPT:RecordFrameOrigin $SCRIPT:RecordHandle $delta $bounds
        Set-ShotHole $Form $SCRIPT:RecordFrame
        Update-RecordFrameBar
        $Form.Invalidate()
        $Form.Update()
        return
    }
    if ($SCRIPT:RecordStage -eq 'move') {
        $delta = [System.Drawing.Point]::new(($point.X - $SCRIPT:RecordDragOrigin.X), ($point.Y - $SCRIPT:RecordDragOrigin.Y))
        $SCRIPT:RecordFrame = Move-RecordFrame $SCRIPT:RecordFrameOrigin $delta $bounds
        Set-ShotHole $Form $SCRIPT:RecordFrame
        Update-RecordFrameBar
        $Form.Invalidate()
        $Form.Update()
        return
    }
    if ($SCRIPT:ShotDragging) {
        $SCRIPT:ShotSelection = Get-ShotRectangle $SCRIPT:ShotStart $point
        Set-ShotHole $Form $SCRIPT:ShotSelection
        $Form.Invalidate()
        # Paint now rather than after the pointer stops: the frame the person is
        # dragging has to be on screen while they are dragging it.
        $Form.Update()
        return
    }
    if ($SCRIPT:RecordStage -eq 'adjust') {
        $handle = Get-RecordFrameHandle $SCRIPT:RecordFrame $point
        if ($handle -ge 0) {
            $Form.Cursor = Get-RecordFrameCursor $handle
        } elseif ($SCRIPT:RecordFrame.Contains($point)) {
            $Form.Cursor = [System.Windows.Forms.Cursors]::SizeAll
        } else {
            $Form.Cursor = [System.Windows.Forms.Cursors]::Cross
        }
    }
}

function Invoke-RecordSheetUp($Form, $EventArgs) {
    if ($SCRIPT:RecordStage -eq 'resize' -or $SCRIPT:RecordStage -eq 'move') {
        $SCRIPT:RecordStage = 'adjust'
        $SCRIPT:RecordHandle = -1
        $Form.Capture = $false
        return
    }
    if (-not $SCRIPT:ShotDragging) { return }
    $SCRIPT:ShotDragging = $false
    $Form.Capture = $false
    if ($EventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    $selection = Get-ShotRectangle $SCRIPT:ShotStart $EventArgs.Location
    if ($selection.Width -lt $SCRIPT:RecordMinSize -or $selection.Height -lt $SCRIPT:RecordMinSize) {
        # Too small to aim at: the frame is dropped and a new drag can start.
        $SCRIPT:ShotSelection = [System.Drawing.Rectangle]::Empty
        Set-ShotHole $Form $SCRIPT:ShotSelection
        $Form.Invalidate()
        return
    }
    $SCRIPT:RecordFrame = $selection
    $SCRIPT:RecordStage = 'adjust'
    Set-ShotHole $Form $SCRIPT:RecordFrame
    Show-RecordFrameBar $Form
    $Form.Invalidate()
}

function Close-RecordFrameBar {
    $bar = $SCRIPT:RecordFrameBar
    $font = $SCRIPT:RecordFrameBarFont
    $SCRIPT:RecordFrameBar = $null
    $SCRIPT:RecordFrameBarFont = $null
    $SCRIPT:RecordFrameBarMetrics = $null
    $SCRIPT:RecordFrameBarHover = $false
    if ($null -ne $bar) {
        try { $bar.Hide() } catch { }
        try { $bar.Close() } catch { }
        try { $bar.Dispose() } catch { }
    }
    if ($null -ne $font) { try { $font.Dispose() } catch { } }
}

function Get-RecordFrameBarLayout([System.Drawing.Font]$Font) {
    $scale = [Math]::Max(1.0, $Font.Height / 16.0)
    $pad = [int][Math]::Round(14 * $scale)
    $dot = [int][Math]::Round(9 * $scale)
    $gap = [int][Math]::Round(8 * $scale)
    $sizeGap = [int][Math]::Round(14 * $scale)
    $height = [int][Math]::Round(40 * $scale)
    $startWidth = [System.Windows.Forms.TextRenderer]::MeasureText($SCRIPT:Labels.RecordStart, $Font).Width
    $sizeWidth = [System.Windows.Forms.TextRenderer]::MeasureText('0000 x 0000', $Font).Width
    $width = $pad + $dot + $gap + $startWidth + $sizeGap + $sizeWidth + $pad
    return [pscustomobject]@{
        Scale = $scale
        Pad = $pad
        Dot = $dot
        Gap = $gap
        SizeGap = $sizeGap
        Height = $height
        Width = $width
        StartWidth = $startWidth
        SizeWidth = $sizeWidth
    }
}

function Draw-RecordFrameBar([System.Drawing.Graphics]$Graphics, $Metrics, [System.Drawing.Font]$Font,
    [string]$SizeText, [bool]$Hover) {
    # The sheet's start button: a red dot, the label, and the frame's size, so the
    # numbers are readable while the frame is dragged.
    $background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 43, 52))
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 96, 92))
    try {
        $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $Graphics.FillRectangle($background, 0, 0, $Metrics.Width, $Metrics.Height)
        $Graphics.FillEllipse($dotBrush, $Metrics.Pad,
            [int](($Metrics.Height - $Metrics.Dot) / 2), $Metrics.Dot, $Metrics.Dot)
        $textLeft = $Metrics.Pad + $Metrics.Dot + $Metrics.Gap
        $flags = [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
            [System.Windows.Forms.TextFormatFlags]::Left -bor
            [System.Windows.Forms.TextFormatFlags]::NoPrefix -bor
            [System.Windows.Forms.TextFormatFlags]::SingleLine
        $startRect = [System.Drawing.Rectangle]::new($textLeft, 0, ($Metrics.StartWidth + 8), $Metrics.Height)
        $startColor = if ($Hover) {
            [System.Drawing.Color]::FromArgb(255, 255, 255)
        } else {
            [System.Drawing.Color]::FromArgb(240, 244, 250)
        }
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.RecordStart, $Font, $startRect, $startColor, $flags)
        $sizeLeft = $textLeft + $Metrics.StartWidth + $Metrics.SizeGap
        $sizeRect = [System.Drawing.Rectangle]::new($sizeLeft, 0, ($Metrics.Width - $sizeLeft - $Metrics.Pad), $Metrics.Height)
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SizeText, $Font, $sizeRect,
            [System.Drawing.Color]::FromArgb(168, 178, 194), $flags)
    } finally {
        $dotBrush.Dispose()
        $background.Dispose()
    }
}

function Show-RecordFrameBar([System.Windows.Forms.Form]$Sheet) {
    Close-RecordFrameBar
    if ($null -eq $Sheet -or $SCRIPT:RecordFrame.Width -le 0) { return }
    $font = Get-QuickAccessFont 9 $true
    try {
        $metrics = Get-RecordFrameBarLayout $font
        $size = [System.Drawing.Size]::new($metrics.Width, $metrics.Height)
        $frameOnScreen = [System.Drawing.Rectangle]::new(
            ($Sheet.Left + $SCRIPT:RecordFrame.Left), ($Sheet.Top + $SCRIPT:RecordFrame.Top),
            $SCRIPT:RecordFrame.Width, $SCRIPT:RecordFrame.Height)
        $bounds = Get-RecordFrameBarBounds $frameOnScreen $size ([System.Windows.Forms.SystemInformation]::VirtualScreen)
        $form = New-Object DshPet.RecordBarForm
        $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
        $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
        $form.ShowInTaskbar = $false
        $form.TopMost = $true
        $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
        $form.BackColor = [System.Drawing.Color]::FromArgb(38, 43, 52)
        $form.ClientSize = $size
        Set-QuickAccessRegion $form ([int][Math]::Round(12 * $metrics.Scale))
        $form.Cursor = [System.Windows.Forms.Cursors]::Hand
        $SCRIPT:RecordFrameBarMetrics = $metrics
        $SCRIPT:RecordFrameBarFont = $font
        $form.add_Paint({
            param($sender, $eventArgs)
            try {
                $metrics = $SCRIPT:RecordFrameBarMetrics
                $font = $SCRIPT:RecordFrameBarFont
                if ($null -eq $metrics -or $null -eq $font) { return }
                $frame = $SCRIPT:RecordFrame
                $sizeText = '{0} x {1}' -f $frame.Width, $frame.Height
                Draw-RecordFrameBar $eventArgs.Graphics $metrics $font $sizeText $SCRIPT:RecordFrameBarHover
            } catch {
                Write-Log "drawing the recording start bar failed: $($_.Exception.Message)"
            }
        })
        $form.add_MouseEnter({
            $SCRIPT:RecordFrameBarHover = $true
            try { $sender.Invalidate() } catch { }
        })
        $form.add_MouseLeave({
            $SCRIPT:RecordFrameBarHover = $false
            try { $sender.Invalidate() } catch { }
        })
        $form.add_MouseDown({
            param($sender, $eventArgs)
            if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
            try { Start-RecordFromSheet } catch {
                Write-Log "starting the recording failed: $($_.Exception.Message)"
                try { Show-RecordFailure $_.Exception.Message } catch { }
            }
        })
        # The start window is a window of its own rather than a child of the sheet,
        # so a key that lands on it never reaches the sheet's handler. Escape is the
        # way out of the whole selection, wherever the focus happens to be.
        $form.KeyPreview = $true
        $form.add_KeyDown({
            param($sender, $eventArgs)
            if ($eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
                $eventArgs.Handled = $true
                Close-ShotOverlay
            }
        })
        $SCRIPT:RecordFrameBar = $form
        $form.Location = $bounds.Location
        $form.Show()
        # The sheet is topmost as well, and a later topmost window does not
        # automatically sit above it: without this the start button ends up under
        # the sheet and a click lands on the desktop instead of starting.
        try { $form.BringToFront() } catch { }
        # Showing this window is what took the focus off the sheet, and Escape is
        # only heard by the window that has it. Handing it back does not move the
        # start window down the Z order, so the button stays clickable.
        try { [void][DshPet.Win32]::SetActiveWindow($Sheet.Handle) } catch { }
    } catch {
        if ($null -ne $font) { try { $font.Dispose() } catch { } }
        $SCRIPT:RecordFrameBar = $null
        $SCRIPT:RecordFrameBarFont = $null
        $SCRIPT:RecordFrameBarMetrics = $null
        throw
    }
}

function Update-RecordFrameBar {
    $bar = $SCRIPT:RecordFrameBar
    $sheet = $SCRIPT:ShotOverlay
    if ($null -eq $bar -or $null -eq $sheet) { return }
    if ($SCRIPT:RecordFrame.Width -le 0) { return }
    $frameOnScreen = [System.Drawing.Rectangle]::new(
        ($sheet.Left + $SCRIPT:RecordFrame.Left), ($sheet.Top + $SCRIPT:RecordFrame.Top),
        $SCRIPT:RecordFrame.Width, $SCRIPT:RecordFrame.Height)
    $bounds = Get-RecordFrameBarBounds $frameOnScreen ([System.Drawing.Size]::new($bar.Width, $bar.Height)) `
        ([System.Windows.Forms.SystemInformation]::VirtualScreen)
    $bar.Location = $bounds.Location
    try { $bar.BringToFront() } catch { }
    try { $bar.Invalidate() } catch { }
}

function Start-RecordFromSheet {
    $frame = $SCRIPT:RecordFrame
    if ($frame.Width -lt $SCRIPT:RecordMinSize -or $frame.Height -lt $SCRIPT:RecordMinSize) { return }
    $sheet = $SCRIPT:ShotOverlay
    $left = if ($null -ne $sheet) { $sheet.Left } else { 0 }
    $top = if ($null -ne $sheet) { $sheet.Top } else { 0 }
    $area = Get-RecordArea ([System.Drawing.Rectangle]::new(($left + $frame.Left), ($top + $frame.Top), $frame.Width, $frame.Height)) `
        ([System.Windows.Forms.SystemInformation]::VirtualScreen)
    # The sheet and its start window must be off the screen before the first frame,
    # the way a capture hides its own sheet before reading the screen.
    Close-RecordFrameBar
    Close-ShotOverlay
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 120
    try { Start-ScreenRecord $area } catch {
        Write-Log "starting the recording failed: $($_.Exception.Message)"
        try { Show-RecordFailure $_.Exception.Message } catch { }
    }
}

# ---- recording (bar, process, notices) --------------------------------------
# Once the sheet is gone, a recording has no window that says it is running. The
# bar is that window: it is drawn whole like the preview, it lives outside the
# recorded area, and a click anywhere on it stops the recording. When the area
# fills the desktop there is nowhere to put it, so it is not shown at all and the
# menu row is the way to stop - a bar inside the recording would be in the file.
function Show-RecordFailure([string]$Detail) {
    $text = $SCRIPT:Labels.RecordFailed
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { $text = "$text`n`n$Detail" }
    [void][System.Windows.MessageBox]::Show($SCRIPT:Window, $text,
        $SCRIPT:Labels.PetName, [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Warning)
}

function Close-RecordBar {
    $bar = $SCRIPT:RecordBar
    $font = $SCRIPT:RecordBarFont
    $SCRIPT:RecordBar = $null
    $SCRIPT:RecordBarFont = $null
    $SCRIPT:RecordBarMetrics = $null
    $SCRIPT:RecordBarHover = $false
    if ($null -ne $SCRIPT:RecordBarTimer) { $SCRIPT:RecordBarTimer.Stop() }
    if ($null -ne $bar) {
        try { $bar.Hide() } catch { }
        try { $bar.Close() } catch { }
        try { $bar.Dispose() } catch { }
    }
    if ($null -ne $font) { try { $font.Dispose() } catch { } }
}

function Get-RecordBarLayout([System.Drawing.Font]$Font) {
    # Measured from the font: a layout pinned to 96dpi pixels clips the clock at
    # another display scale. The clock column is sized for the longest form it can
    # reach, so the bar does not jump when an hour passes.
    $scale = [Math]::Max(1.0, $Font.Height / 16.0)
    $pad = [int][Math]::Round(14 * $scale)
    $dot = [int][Math]::Round(9 * $scale)
    $gap = [int][Math]::Round(8 * $scale)
    $stopGap = [int][Math]::Round(16 * $scale)
    $buttonGap = [int][Math]::Round(10 * $scale)
    # Both labels are measured rather than assumed: they are the words the person
    # reads to end or drop the recording, and a fixed width clipped them.
    $stopWidth = [System.Windows.Forms.TextRenderer]::MeasureText($SCRIPT:Labels.RecordBarStop, $Font).Width +
        [int][Math]::Round(26 * $scale)
    $cancelWidth = [System.Windows.Forms.TextRenderer]::MeasureText($SCRIPT:Labels.RecordCancel, $Font).Width +
        [int][Math]::Round(26 * $scale)
    $height = [int][Math]::Round(40 * $scale)
    $stopHeight = [int][Math]::Round(24 * $scale)
    $clockWidth = 0
    foreach ($sample in @(
        ($SCRIPT:Labels.RecordBarPrefix + ' ' + (Format-RecordClock 0)),
        ($SCRIPT:Labels.RecordBarPrefix + ' ' + (Format-RecordClock 3723000))
    )) {
        $measured = [System.Windows.Forms.TextRenderer]::MeasureText($sample, $Font).Width
        if ($measured -gt $clockWidth) { $clockWidth = $measured }
    }
    $width = $pad + $dot + $gap + $clockWidth + $stopGap + $stopWidth + $buttonGap + $cancelWidth + $pad
    $cancelLeft = $width - $pad - $cancelWidth
    return [pscustomobject]@{
        Scale       = $scale
        Pad         = $pad
        Dot         = $dot
        Gap         = $gap
        StopGap     = $stopGap
        ButtonGap   = $buttonGap
        StopWidth   = $stopWidth
        CancelWidth = $cancelWidth
        StopHeight  = $stopHeight
        Height      = $height
        Width       = $width
        StopLeft    = ($cancelLeft - $buttonGap - $stopWidth)
        CancelLeft  = $cancelLeft
    }
}

function Get-RecordBarClock {
    if ($SCRIPT:RecordStartedAt -eq [DateTime]::MinValue) { return (Format-RecordClock 0) }
    return (Format-RecordClock ([DateTime]::Now - $SCRIPT:RecordStartedAt).TotalMilliseconds)
}

function Draw-RecordBar([System.Drawing.Graphics]$Graphics, $Metrics, [System.Drawing.Font]$Font,
    [string]$Clock, [bool]$Hover) {
    # The bar's whole surface as one function: the window paints with it, and the
    # off-screen probe draws the same picture, so a layout the font no longer fits
    # is caught without a desktop to record.
    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 43, 52))
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 96, 92))
    $buttonBrush = $null
    $cancelPen = $null
    try {
        $Graphics.FillRectangle($background, 0, 0, $Metrics.Width, $Metrics.Height)
        $Graphics.FillEllipse($dotBrush, $Metrics.Pad,
            [int](($Metrics.Height - $Metrics.Dot) / 2), $Metrics.Dot, $Metrics.Dot)
        $clockLeft = $Metrics.Pad + $Metrics.Dot + $Metrics.Gap
        $clockRect = [System.Drawing.Rectangle]::new($clockLeft, 0,
            ($Metrics.StopLeft - $Metrics.StopGap - $clockLeft), $Metrics.Height)
        $flags = [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
            [System.Windows.Forms.TextFormatFlags]::Left -bor
            [System.Windows.Forms.TextFormatFlags]::NoPrefix -bor
            [System.Windows.Forms.TextFormatFlags]::SingleLine
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $Clock, $Font, $clockRect,
            [System.Drawing.Color]::FromArgb(240, 244, 250), $flags)
        $buttonRect = [System.Drawing.Rectangle]::new($Metrics.StopLeft,
            [int](($Metrics.Height - $Metrics.StopHeight) / 2), $Metrics.StopWidth, $Metrics.StopHeight)
        $buttonColor = if ($Hover) {
            [System.Drawing.Color]::FromArgb(78, 88, 104)
        } else {
            [System.Drawing.Color]::FromArgb(58, 66, 80)
        }
        $buttonBrush = New-Object System.Drawing.SolidBrush($buttonColor)
        $Graphics.FillRectangle($buttonBrush, $buttonRect)
        $buttonFlags = [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
            [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor
            [System.Windows.Forms.TextFormatFlags]::NoPrefix -bor
            [System.Windows.Forms.TextFormatFlags]::SingleLine
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.RecordBarStop,
            $Font, $buttonRect, [System.Drawing.Color]::FromArgb(240, 244, 250), $buttonFlags)
        # Cancelling drops the take instead of keeping it; it is a plain outline so
        # the two buttons do not read as two equally likely answers.
        $cancelRect = [System.Drawing.Rectangle]::new($Metrics.CancelLeft,
            [int](($Metrics.Height - $Metrics.StopHeight) / 2), $Metrics.CancelWidth, $Metrics.StopHeight)
        $cancelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(92, 101, 118), 1)
        $Graphics.DrawRectangle($cancelPen, $cancelRect)
        [System.Windows.Forms.TextRenderer]::DrawText($Graphics, $SCRIPT:Labels.RecordCancel,
            $Font, $cancelRect, [System.Drawing.Color]::FromArgb(196, 204, 216), $buttonFlags)
    } finally {
        if ($null -ne $cancelPen) { $cancelPen.Dispose() }
        if ($null -ne $buttonBrush) { $buttonBrush.Dispose() }
        $dotBrush.Dispose()
        $background.Dispose()
    }
}

function New-RecordBar($Metrics, [System.Drawing.Font]$Font) {
    $form = New-Object DshPet.RecordBarForm
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.ShowInTaskbar = $false
    $form.TopMost = $true
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $form.BackColor = [System.Drawing.Color]::FromArgb(38, 43, 52)
    $form.ClientSize = New-Object System.Drawing.Size($Metrics.Width, $Metrics.Height)
    Set-QuickAccessRegion $form ([int][Math]::Round(12 * $Metrics.Scale))
    $form.Cursor = [System.Windows.Forms.Cursors]::Hand

    $form.add_Paint({
        param($sender, $eventArgs)
        try {
            if ($null -eq $SCRIPT:RecordBarMetrics -or $null -eq $SCRIPT:RecordBarFont) { return }
            $clock = $SCRIPT:Labels.RecordBarPrefix + ' ' + (Get-RecordBarClock)
            Draw-RecordBar $eventArgs.Graphics $SCRIPT:RecordBarMetrics $SCRIPT:RecordBarFont $clock $SCRIPT:RecordBarHover
        } catch {
            Write-Log "drawing the recording bar failed: $($_.Exception.Message)"
        }
    })
    $form.add_MouseEnter({
        $SCRIPT:RecordBarHover = $true
        try { $sender.Invalidate() } catch { }
    })
    $form.add_MouseLeave({
        $SCRIPT:RecordBarHover = $false
        try { $sender.Invalidate() } catch { }
    })
    $form.add_MouseDown({
        param($sender, $eventArgs)
        if ($eventArgs.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
        try {
            $metrics = $SCRIPT:RecordBarMetrics
            if ($null -ne $metrics) {
                $cancelRect = [System.Drawing.Rectangle]::new($metrics.CancelLeft,
                    [int](($metrics.Height - $metrics.StopHeight) / 2), $metrics.CancelWidth, $metrics.StopHeight)
                if ($cancelRect.Contains($eventArgs.Location)) {
                    Cancel-ScreenRecord
                    return
                }
            }
            Stop-ScreenRecord
        } catch {
            Write-Log "ending the recording failed: $($_.Exception.Message)"
        }
    })
    return $form
}

function Start-RecordBarTimer {
    if ($null -eq $SCRIPT:RecordBarTimer) {
        $SCRIPT:RecordBarTimer = New-Object System.Windows.Threading.DispatcherTimer
        $SCRIPT:RecordBarTimer.Interval = [TimeSpan]::FromMilliseconds(500)
        $SCRIPT:RecordBarTimer.Add_Tick({
            try {
                if ($null -eq $SCRIPT:RecordBar) { $SCRIPT:RecordBarTimer.Stop(); return }
                $SCRIPT:RecordBar.Invalidate()
            } catch { }
        })
    }
    $SCRIPT:RecordBarTimer.Start()
}

function Show-RecordBar([System.Drawing.Rectangle]$Area) {
    # Returns whether a bar could be placed: false means the area covers the
    # desktop, and the notice tells the person to use the menu instead.
    Close-RecordBar
    $font = Get-QuickAccessFont 9 $true
    try {
        $metrics = Get-RecordBarLayout $font
        $size = [System.Drawing.Size]::new($metrics.Width, $metrics.Height)
        $bounds = Get-RecordBarBounds $Area $size ([System.Windows.Forms.SystemInformation]::VirtualScreen)
        if ($bounds.Width -le 0) {
            $font.Dispose()
            return $false
        }
        $form = New-RecordBar $metrics $font
        $SCRIPT:RecordBar = $form
        $SCRIPT:RecordBarFont = $font
        $SCRIPT:RecordBarMetrics = $metrics
        $SCRIPT:RecordBarHover = $false
        $form.Location = $bounds.Location
        $form.Show()
        Start-RecordBarTimer
        return $true
    } catch {
        $font.Dispose()
        $SCRIPT:RecordBar = $null
        $SCRIPT:RecordBarFont = $null
        $SCRIPT:RecordBarMetrics = $null
        throw
    }
}

function Close-RecordOutline {
    $form = $SCRIPT:RecordOutline
    $SCRIPT:RecordOutline = $null
    if ($null -eq $form) { return }
    try { $form.Hide() } catch { }
    try { $form.Close() } catch { }
    try { $form.Dispose() } catch { }
}

function Show-RecordOutline([System.Drawing.Rectangle]$Area) {
    # The frame stays visible while recording so the person can see what is being
    # captured. It is drawn entirely outside the area - gdigrab reads the area
    # rectangle itself, not one pixel of this border - so it never appears in the
    # file. The window's region keeps only that border, so a click passes through
    # the middle to whatever is underneath.
    Close-RecordOutline
    if ($Area.Width -lt 2 -or $Area.Height -lt 2) { return }
    $border = 3
    $width = $Area.Width + ($border * 2)
    $height = $Area.Height + ($border * 2)
    $form = New-Object DshPet.RecordBarForm
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.ShowInTaskbar = $false
    $form.TopMost = $true
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $form.BackColor = [System.Drawing.Color]::FromArgb(244, 96, 92)
    $form.ClientSize = New-Object System.Drawing.Size($width, $height)
    $region = [System.Drawing.Region]::new([System.Drawing.Rectangle]::new(0, 0, $width, $height))
    $inner = [System.Drawing.Region]::new([System.Drawing.Rectangle]::new($border, $border, $Area.Width, $Area.Height))
    $region.Exclude($inner)
    $inner.Dispose()
    $form.Region = $region
    $form.Location = New-Object System.Drawing.Point(($Area.Left - $border), ($Area.Top - $border))
    $form.Show()
    $SCRIPT:RecordOutline = $form
}

function Copy-RecordFile([string]$Path) {
    # A video cannot ride the clipboard as pixels, so the file itself is offered:
    # Explorer and chat windows then paste a file, which is what a recording is.
    $files = New-Object System.Collections.Specialized.StringCollection
    [void]$files.Add($Path)
    $lastError = ''
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        try {
            [System.Windows.Forms.Clipboard]::SetFileDropList($files)
            return $true
        } catch {
            $lastError = $_.Exception.Message
            Start-Sleep -Milliseconds 80
        }
    }
    Write-Log "copying the recording to the clipboard failed: $lastError"
    return $false
}

function New-RecordPath([string]$Directory) {
    # The name is fixed when the recording starts, because the preview plays the
    # file where it will stay. Two recordings inside one second get a suffix so the
    # second cannot overwrite the first.
    $path = Get-RecordFileName $Directory
    if (-not (Test-Path -LiteralPath $path)) { return $path }
    $base = [System.IO.Path]::GetFileNameWithoutExtension($path)
    $extension = [System.IO.Path]::GetExtension($path)
    for ($index = 2; $index -lt 1000; $index++) {
        $candidate = Join-Path $Directory ('{0}-{1}{2}' -f $base, $index, $extension)
        if (-not (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $path
}

function New-RecordPreviewButton([string]$Text, [bool]$Primary, $OnClick) {
    # A button drawn as a label on a rounded plate: the card has no stock chrome,
    # and a default WPF button would bring its own hover and border with it.
    $border = New-Object System.Windows.Controls.Border
    $border.CornerRadius = [System.Windows.CornerRadius]::new(7)
    $border.Padding = [System.Windows.Thickness]::new(14, 6, 14, 6)
    $border.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
    $border.Cursor = [System.Windows.Input.Cursors]::Hand
    if ($Primary) {
        $border.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(53, 59, 70))
        $ink = [System.Windows.Media.Color]::FromRgb(250, 251, 253)
    } else {
        $border.BorderBrush = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(205, 211, 220))
        $border.BorderThickness = [System.Windows.Thickness]::new(1)
        $ink = [System.Windows.Media.Color]::FromRgb(53, 59, 70)
    }
    $label = New-Object System.Windows.Controls.TextBlock
    $label.Text = $Text
    $label.FontSize = 12
    $label.Foreground = New-Object System.Windows.Media.SolidColorBrush($ink)
    $border.Child = $label
    $border.add_MouseLeftButtonUp($OnClick)
    return $border
}

function Set-RecordPreviewCorners($Window) {
    # The preview window is opaque so its player can compose a picture; the card's
    # rounded corners are then the window's region, cut at the size the window
    # actually has.
    if ($null -eq $Window) { return }
    try {
        $helper = New-Object System.Windows.Interop.WindowInteropHelper($Window)
        $handle = $helper.Handle
        if ($handle -eq [System.IntPtr]::Zero) { return }
        $source = [System.Windows.Interop.HwndSource]::FromHwnd($handle)
        if ($null -eq $source -or $null -eq $source.CompositionTarget) { return }
        $transform = $source.CompositionTarget.TransformToDevice
        $width = [int][Math]::Round($Window.ActualWidth * $transform.M11)
        $height = [int][Math]::Round($Window.ActualHeight * $transform.M22)
        if ($width -le 0 -or $height -le 0) { return }
        $diameter = [int][Math]::Max(2, [Math]::Round(28 * [Math]::Max($transform.M11, $transform.M22)))
        $region = [DshPet.Win32]::CreateRoundRectRgn(0, 0, ($width + 1), ($height + 1), $diameter, $diameter)
        if ($region -eq [System.IntPtr]::Zero) { return }
        if ([DshPet.Win32]::SetWindowRgn($handle, $region, $true) -eq 0) {
            # A refused region is not adopted, and then the handle is still ours.
            [void][DshPet.Win32]::DeleteObject($region)
        }
    } catch { }
}

function New-RecordPreviewWindow([string]$Path, [int]$Seconds, [System.Drawing.Rectangle]$Area) {
    $screen = [System.Windows.Forms.Screen]::FromRectangle($Area).WorkingArea
    $layout = Get-RecordPreviewLayout ([Math]::Max(1, $Area.Width)) ([Math]::Max(1, $Area.Height)) $screen
    $imageWidth = $layout.ImageWidth
    $imageHeight = $layout.ImageHeight
    $size = Format-RecordSize 0
    try { $size = Format-RecordSize (Get-Item -LiteralPath $Path).Length } catch { }

    $window = New-Object System.Windows.Window
    $window.WindowStyle = [System.Windows.WindowStyle]::None
    # A layered window (AllowsTransparency) has no surface a video can be composed
    # into: MediaElement draws its first frame into black and never recovers, which
    # is what a preview that cannot show the take looks like. The card is opaque,
    # so its own corners are what gets rounded, by cutting the window's region.
    $window.AllowsTransparency = $false
    $window.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(252, 252, 253))
    $window.ShowInTaskbar = $false
    $window.Topmost = $true
    $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
    $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
    $window.Focusable = $true

    $panel = New-Object System.Windows.Controls.StackPanel
    $panel.Margin = [System.Windows.Thickness]::new(22, 16, 22, 20)
    $panel.Width = $imageWidth + 44

    # Title row: the title on the left, the hint and the close cross on the right.
    $header = New-Object System.Windows.Controls.Grid
    $titleColumn = New-Object System.Windows.Controls.ColumnDefinition
    $titleColumn.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$header.ColumnDefinitions.Add($titleColumn)
    $rightColumn = New-Object System.Windows.Controls.ColumnDefinition
    $rightColumn.Width = [System.Windows.GridLength]::Auto
    [void]$header.ColumnDefinitions.Add($rightColumn)
    $title = New-Object System.Windows.Controls.TextBlock
    $title.Text = $SCRIPT:Labels.RecordPreviewTitle
    $title.FontSize = 17
    $title.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $title.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(38, 43, 52))
    [System.Windows.Controls.Grid]::SetColumn($title, 0)
    [void]$header.Children.Add($title)
    $headerRight = New-Object System.Windows.Controls.StackPanel
    $headerRight.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $headerRight.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $hint = New-Object System.Windows.Controls.TextBlock
    $hint.Text = $SCRIPT:Labels.RecordPreviewHint
    $hint.FontSize = 11
    $hint.Margin = [System.Windows.Thickness]::new(0, 0, 14, 0)
    $hint.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(150, 158, 170))
    [void]$headerRight.Children.Add($hint)
    $close = New-Object System.Windows.Controls.TextBlock
    $close.Text = 'X'
    $close.FontSize = 14
    $close.Cursor = [System.Windows.Input.Cursors]::Hand
    $close.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(110, 120, 134))
    # On the press rather than the release: the header around it starts a window
    # drag, and a drag that begins on the cross would otherwise swallow the click.
    $close.add_MouseLeftButtonDown({
        param($sender, $eventArgs)
        $eventArgs.Handled = $true
        try { Invoke-RecordPreviewChoice '' } catch { }
    })
    [void]$headerRight.Children.Add($close)
    [System.Windows.Controls.Grid]::SetColumn($headerRight, 1)
    [void]$header.Children.Add($headerRight)
    $header.Margin = [System.Windows.Thickness]::new(0, 0, 0, 12)
    # A window with no title bar has to be movable by what stands in for one: the
    # header drags it, and so does the picture. Both are surfaces without a job of
    # their own, so a press there means "move this" and nothing else.
    $header.add_MouseLeftButtonDown({
        param($sender, $eventArgs)
        try { [System.Windows.Window]::GetWindow($sender).DragMove() } catch { }
    })
    [void]$panel.Children.Add($header)

    # The player: a MediaElement on a dark plate, sized from the recorded area.
    $media = New-Object System.Windows.Controls.MediaElement
    $media.Height = $imageHeight
    $media.Width = $imageWidth
    $media.Stretch = [System.Windows.Media.Stretch]::Uniform
    $media.LoadedBehavior = [System.Windows.Controls.MediaState]::Manual
    $media.UnloadedBehavior = [System.Windows.Controls.MediaState]::Manual
    $media.ScrubbingEnabled = $true
    $media.Source = [System.Uri]::new(('file:///' + ($Path -replace '\\', '/')))
    $SCRIPT:RecordPreviewMedia = $media
    $media.add_MediaOpened({
        try {
            $element = $SCRIPT:RecordPreviewMedia
            $slider = $SCRIPT:RecordPreviewSlider
            if ($null -eq $element) { return }
            $natural = $element.NaturalDuration
            if ($null -ne $slider -and $natural.HasTimeSpan) { $slider.Maximum = [Math]::Max(0.1, $natural.TimeSpan.TotalSeconds) }
            # The first frame is the poster: play just long enough for the player to
            # compose a picture, then hold it there. A preview that opens on black
            # says nothing about the take it is asking to keep.
            $element.Play()
            $element.Pause()
            $element.Position = [TimeSpan]::Zero
            $SCRIPT:RecordPreviewPlaying = $false
            if ($null -ne $SCRIPT:RecordPreviewPlayText) { $SCRIPT:RecordPreviewPlayText.Text = $SCRIPT:Labels.RecordPlay }
        } catch {
            Write-Log "starting the recording preview failed: $($_.Exception.Message)"
        }
    })
    $media.add_MediaEnded({
        try {
            $element = $SCRIPT:RecordPreviewMedia
            if ($null -ne $element) {
                $element.Pause()
                $element.Position = [TimeSpan]::Zero
            }
            $SCRIPT:RecordPreviewPlaying = $false
            if ($null -ne $SCRIPT:RecordPreviewSlider) { $SCRIPT:RecordPreviewSlider.Value = 0 }
            if ($null -ne $SCRIPT:RecordPreviewPlayText) { $SCRIPT:RecordPreviewPlayText.Text = $SCRIPT:Labels.RecordPlay }
        } catch { }
    })
    $media.add_MediaFailed({
        try {
            if ($null -ne $SCRIPT:RecordPreviewInfoText) {
                $SCRIPT:RecordPreviewInfoText.Text = $SCRIPT:Labels.RecordPreviewFailed
            }
        } catch { }
    })
    $mediaPlate = New-Object System.Windows.Controls.Border
    $mediaPlate.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(20, 24, 30))
    $mediaPlate.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $mediaPlate.Child = $media
    # The picture is the largest surface on the card and has no click of its own, so
    # grabbing it moves the window too.
    $mediaPlate.add_MouseLeftButtonDown({
        param($sender, $eventArgs)
        try { [System.Windows.Window]::GetWindow($sender).DragMove() } catch { }
    })
    [void]$panel.Children.Add($mediaPlate)

    # Transport: play/pause, a seek bar, and where the playhead is.
    $transport = New-Object System.Windows.Controls.Grid
    $transport.Margin = [System.Windows.Thickness]::new(0, 8, 0, 2)
    $playColumn = New-Object System.Windows.Controls.ColumnDefinition
    $playColumn.Width = [System.Windows.GridLength]::Auto
    [void]$transport.ColumnDefinitions.Add($playColumn)
    $sliderColumn = New-Object System.Windows.Controls.ColumnDefinition
    $sliderColumn.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
    [void]$transport.ColumnDefinitions.Add($sliderColumn)
    $timeColumn = New-Object System.Windows.Controls.ColumnDefinition
    $timeColumn.Width = [System.Windows.GridLength]::Auto
    [void]$transport.ColumnDefinitions.Add($timeColumn)
    $playPlate = New-Object System.Windows.Controls.Border
    $playPlate.CornerRadius = [System.Windows.CornerRadius]::new(7)
    $playPlate.Padding = [System.Windows.Thickness]::new(12, 5, 12, 5)
    $playPlate.Cursor = [System.Windows.Input.Cursors]::Hand
    $playPlate.BorderBrush = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(205, 211, 220))
    $playPlate.BorderThickness = [System.Windows.Thickness]::new(1)
    $playText = New-Object System.Windows.Controls.TextBlock
    $playText.Text = $SCRIPT:Labels.RecordPlay
    $playText.FontSize = 12
    $playText.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(53, 59, 70))
    $playPlate.Child = $playText
    $playPlate.add_MouseLeftButtonUp({
        try {
            $element = $SCRIPT:RecordPreviewMedia
            if ($null -eq $element) { return }
            # The button's own state, not MediaElement.IsPlaying: a paused player
            # reports false while it is still opening, so a second press used to
            # restart instead of stopping.
            if ($SCRIPT:RecordPreviewPlaying) {
                $element.Pause()
                $SCRIPT:RecordPreviewPlaying = $false
                if ($null -ne $SCRIPT:RecordPreviewPlayText) { $SCRIPT:RecordPreviewPlayText.Text = $SCRIPT:Labels.RecordPlay }
            } else {
                $element.Play()
                $SCRIPT:RecordPreviewPlaying = $true
                if ($null -ne $SCRIPT:RecordPreviewPlayText) { $SCRIPT:RecordPreviewPlayText.Text = $SCRIPT:Labels.RecordPause }
            }
        } catch { }
    })
    $SCRIPT:RecordPreviewPlayText = $playText
    [System.Windows.Controls.Grid]::SetColumn($playPlate, 0)
    [void]$transport.Children.Add($playPlate)
    $slider = New-Object System.Windows.Controls.Slider
    $slider.Minimum = 0
    $slider.Maximum = 1
    $slider.Value = 0
    $slider.Margin = [System.Windows.Thickness]::new(10, 0, 10, 0)
    $slider.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $slider.add_PreviewMouseLeftButtonDown({ $SCRIPT:RecordPreviewSeeking = $true })
    $slider.add_PreviewMouseLeftButtonUp({
        try {
            $SCRIPT:RecordPreviewSeeking = $false
            $element = $SCRIPT:RecordPreviewMedia
            if ($null -ne $element) { $element.Position = [TimeSpan]::FromSeconds($SCRIPT:RecordPreviewSlider.Value) }
        } catch { }
    })
    $SCRIPT:RecordPreviewSlider = $slider
    [System.Windows.Controls.Grid]::SetColumn($slider, 1)
    [void]$transport.Children.Add($slider)
    $timeText = New-Object System.Windows.Controls.TextBlock
    $timeText.Text = ('{0} / {1}' -f (Format-RecordClock 0), (Format-RecordClock ($Seconds * 1000)))
    $timeText.FontSize = 11
    $timeText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $timeText.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(110, 118, 130))
    $SCRIPT:RecordPreviewTimeText = $timeText
    [System.Windows.Controls.Grid]::SetColumn($timeText, 2)
    [void]$transport.Children.Add($timeText)
    [void]$panel.Children.Add($transport)

    $info = New-Object System.Windows.Controls.TextBlock
    $info.Text = $SCRIPT:Labels.RecordPreviewInfo -f $Area.Width, $Area.Height, $size
    $info.FontSize = 11
    $info.Margin = [System.Windows.Thickness]::new(0, 10, 0, 2)
    $info.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(110, 118, 130))
    $SCRIPT:RecordPreviewInfoText = $info
    [void]$panel.Children.Add($info)

    $pathText = New-Object System.Windows.Controls.TextBlock
    $pathText.Text = $SCRIPT:Labels.RecordPreviewTarget -f $Path
    $pathText.FontSize = 11
    $pathText.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
    $pathText.Foreground = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(150, 158, 170))
    [void]$panel.Children.Add($pathText)

    $buttons = New-Object System.Windows.Controls.StackPanel
    $buttons.Orientation = [System.Windows.Controls.Orientation]::Horizontal
    $buttons.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
    $buttons.Margin = [System.Windows.Thickness]::new(0, 14, 0, 0)
    [void]$buttons.Children.Add((New-RecordPreviewButton $SCRIPT:Labels.RecordPreviewCancel $false { try { Invoke-RecordPreviewChoice '' } catch { } }))
    [void]$buttons.Children.Add((New-RecordPreviewButton $SCRIPT:Labels.RecordCopy $false { try { Invoke-RecordPreviewChoice 'copy' } catch { } }))
    [void]$buttons.Children.Add((New-RecordPreviewButton $SCRIPT:Labels.RecordSave $true { try { Invoke-RecordPreviewChoice 'save' } catch { } }))
    [void]$panel.Children.Add($buttons)

    $card = New-Object System.Windows.Controls.Border
    $card.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(252, 252, 253))
    $card.CornerRadius = [System.Windows.CornerRadius]::new(14)
    $card.Child = $panel
    # No drop shadow: an opaque window has nowhere to cast one, and the shadow would
    # paint the corners the window region is already cutting away.
    $card.BorderBrush = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(226, 230, 236))
    $card.BorderThickness = [System.Windows.Thickness]::new(1)
    $window.Content = $card

    # SizeToContent settles after the window is up, so the corners are re-cut when
    # that happens rather than assumed from the layout.
    $window.add_SizeChanged({
        param($sender, $eventArgs)
        try { Set-RecordPreviewCorners $sender } catch { }
    })

    $window.add_KeyDown({
        param($sender, $eventArgs)
        if ($eventArgs.Key -eq [System.Windows.Input.Key]::Escape) {
            $eventArgs.Handled = $true
            try { Close-RecordPreview } catch { }
        }
    })

    # LoadedBehavior=Manual means nothing opens the file: MediaOpened never fires on
    # its own, so the plate stays at the background colour and the transport has
    # nothing to move. Playing once is what opens it; MediaOpened then holds the
    # first frame.
    $window.add_ContentRendered({
        param($sender, $eventArgs)
        try {
            if ($null -ne $SCRIPT:RecordPreviewMedia) { $SCRIPT:RecordPreviewMedia.Play() }
        } catch { }
    })

    $SCRIPT:RecordPreviewTimer = New-Object System.Windows.Threading.DispatcherTimer
    $SCRIPT:RecordPreviewTimer.Interval = [TimeSpan]::FromMilliseconds(250)
    $SCRIPT:RecordPreviewTimer.Add_Tick({
        try {
            $element = $SCRIPT:RecordPreviewMedia
            $slider = $SCRIPT:RecordPreviewSlider
            if ($null -eq $element -or $null -eq $slider) { $SCRIPT:RecordPreviewTimer.Stop(); return }
            if ($SCRIPT:RecordPreviewSeeking) { return }
            $natural = $element.NaturalDuration
            if ($natural.HasTimeSpan -and $natural.TimeSpan.TotalSeconds -gt 0) {
                $slider.Value = [Math]::Min($slider.Maximum, $element.Position.TotalSeconds)
                if ($null -ne $SCRIPT:RecordPreviewTimeText) {
                    $SCRIPT:RecordPreviewTimeText.Text = ('{0} / {1}' -f
                        (Format-RecordClock $element.Position.TotalMilliseconds),
                        (Format-RecordClock $natural.TimeSpan.TotalMilliseconds))
                }
            }
        } catch { }
    })
    $SCRIPT:RecordPreviewTimer.Start()
    return $window
}

function Close-RecordPreviewMedia {
    if ($null -ne $SCRIPT:RecordPreviewTimer) { $SCRIPT:RecordPreviewTimer.Stop() }
    $element = $SCRIPT:RecordPreviewMedia
    if ($null -eq $element) { return }
    try { $element.Stop() } catch { }
    try { $element.Close() } catch { }
    try { $element.Source = $null } catch { }
}

function Invoke-RecordPreviewChoice([string]$Choice) {
    $SCRIPT:RecordPreviewChoice = $Choice
    try { Close-RecordPreviewMedia } catch { }
    $window = $SCRIPT:RecordPreview
    if ($null -ne $window) { try { $window.Close() } catch { } }
}

function Close-RecordPreview {
    $window = $SCRIPT:RecordPreview
    if ($null -eq $window) { return }
    try { Close-RecordPreviewMedia } catch { }
    $SCRIPT:RecordPreviewChoice = ''
    try { $window.Close() } catch { }
}

function Finish-RecordPreview {
    $choice = $SCRIPT:RecordPreviewChoice
    $path = $SCRIPT:RecordPreviewPath
    $SCRIPT:RecordPreview = $null
    $SCRIPT:RecordPreviewChoice = ''
    $SCRIPT:RecordPreviewPath = ''
    $SCRIPT:RecordPreviewMedia = $null
    $SCRIPT:RecordPreviewSlider = $null
    $SCRIPT:RecordPreviewPlayText = $null
    $SCRIPT:RecordPreviewTimeText = $null
    $SCRIPT:RecordPreviewInfoText = $null
    $SCRIPT:RecordPreviewSeeking = $false
    $SCRIPT:RecordPreviewPlaying = $false
    if ($null -ne $SCRIPT:RecordPreviewTimer) { $SCRIPT:RecordPreviewTimer.Stop() }
    if ($choice -eq 'save' -or $choice -eq 'copy') {
        if (-not (Test-RecordFile $path)) {
            try { Show-RecordFailure $SCRIPT:Labels.RecordEmpty } catch { }
            return
        }
        if ($choice -eq 'copy') {
            if (Copy-RecordFile $path) { Show-PetNotice $SCRIPT:Labels.RecordCopied $path }
            else { Show-PetNotice $SCRIPT:Labels.RecordCopyFailed $path }
        } else {
            Show-PetNotice $SCRIPT:Labels.RecordSaved $path
        }
        return
    }
    # Cancelled: the take is dropped. The player may hold the file open for a
    # moment after Close(), so the removal is retried rather than abandoned.
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (-not (Test-Path -LiteralPath $path)) { return }
        try {
            Remove-Item -LiteralPath $path -Force
            return
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    Write-Log "the cancelled recording could not be removed: $path"
}

function Show-RecordPreview([string]$Path, [int]$Seconds, [System.Drawing.Rectangle]$Area) {
    if ($null -ne $SCRIPT:RecordPreview) { Close-RecordPreview }
    $SCRIPT:RecordPreviewPath = $Path
    $SCRIPT:RecordPreviewSeconds = $Seconds
    $SCRIPT:RecordPreviewChoice = ''
    $SCRIPT:RecordPreviewSeeking = $false
    $window = New-RecordPreviewWindow $Path $Seconds $Area
    $SCRIPT:RecordPreview = $window
    $window.add_Closed({
        try { Finish-RecordPreview } catch {
            Write-Log "finishing the recording preview failed: $($_.Exception.Message)"
            try { Show-RecordFailure $_.Exception.Message } catch { }
        }
    })
    $window.Show()
    $window.Activate()
    try { Set-RecordPreviewCorners $window } catch { }
}

function Start-ScreenRecord([System.Drawing.Rectangle]$Area) {
    # One recording at a time: the menu row that starts one is the row that ends
    # it, so a second press while ffmpeg runs ends the recording.
    if ($null -ne $SCRIPT:RecordProcess) { Stop-ScreenRecord; return }
    if ($Area.Width -lt 2 -or $Area.Height -lt 2) { return }
    # The file is written where it will stay: the preview plays it from there, so
    # nothing has to be moved while a player holds it open. Cancelling deletes it.
    $directory = $SCRIPT:RecordDir
    if (-not (Test-Path -LiteralPath $directory)) {
        [void][System.IO.Directory]::CreateDirectory($directory)
    }
    $path = New-RecordPath $directory
    $process = $null
    try {
        $process = Start-RecordProcess $Area $path
        # ffmpeg exits at once when it cannot grab the area, so a bar is only put
        # up for a process that is still alive: a dead one is reported instead.
        for ($attempt = 0; $attempt -lt 10; $attempt++) {
            Start-Sleep -Milliseconds 60
            [System.Windows.Forms.Application]::DoEvents()
            if ($process.HasExited) { break }
        }
        if ($process.HasExited) {
            $code = $process.ExitCode
            $process.Dispose()
            $process = $null
            throw ('ffmpeg exit {0}' -f $code)
        }
        $SCRIPT:RecordProcess = $process
        $SCRIPT:RecordFile = $path
        $SCRIPT:RecordArea = $Area
        $SCRIPT:RecordStartedAt = [DateTime]::Now
        $barShown = $false
        try { $barShown = Show-RecordBar $Area }
        catch { Write-Log "showing the recording bar failed: $($_.Exception.Message)" }
        try { Show-RecordOutline $Area }
        catch { Write-Log "showing the recording frame failed: $($_.Exception.Message)" }
        Update-RecordMenu
        $hint = $SCRIPT:Labels.RecordStartedHint -f $Area.Width, $Area.Height
        if (-not $barShown) { $hint = "$hint`n$($SCRIPT:Labels.RecordMenuStopHint)" }
        Write-Log "screen recording started: area=$($Area.Width)x$($Area.Height) file=$path"
        Show-PetNotice $SCRIPT:Labels.RecordStarted $hint
    } catch {
        $SCRIPT:RecordFile = ''
        $SCRIPT:RecordArea = [System.Drawing.Rectangle]::Empty
        Close-RecordOutline
        if (Test-Path -LiteralPath $path) { try { Remove-Item -LiteralPath $path -Force } catch { } }
        if ($null -ne $process) {
            try { if (-not $process.HasExited) { $process.Kill() } } catch { }
            try { $process.Dispose() } catch { }
        }
        throw
    }
}

function Stop-ScreenRecord([bool]$Announce = $true) {
    # ffmpeg is asked to finish rather than killed: 'q' is what lets it write the
    # index an MP4 needs. The file is the proof, so an empty one is reported.
    $process = $SCRIPT:RecordProcess
    if ($null -eq $process) { return }
    $SCRIPT:RecordProcess = $null
    $file = $SCRIPT:RecordFile
    $area = $SCRIPT:RecordArea
    $seconds = if ($SCRIPT:RecordStartedAt -ne [DateTime]::MinValue) {
        [int]([DateTime]::Now - $SCRIPT:RecordStartedAt).TotalSeconds
    } else { 0 }
    $SCRIPT:RecordFile = ''
    $SCRIPT:RecordArea = [System.Drawing.Rectangle]::Empty
    $SCRIPT:RecordStartedAt = [DateTime]::MinValue
    Close-RecordBar
    Close-RecordOutline
    Update-RecordMenu
    $code = Stop-RecordProcess $process
    try { $process.Dispose() } catch { }
    $saved = Test-RecordFile $file
    Write-Log "screen recording stopped: exit=$code saved=$saved file=$file"
    if (-not $saved) {
        if (Test-Path -LiteralPath $file) { try { Remove-Item -LiteralPath $file -Force } catch { } }
        if ($Announce) { try { Show-RecordFailure $SCRIPT:Labels.RecordEmpty } catch { } }
        return
    }
    if (-not $Announce) {
        # The pet is exiting: the file is kept rather than offered, because nobody
        # is there to choose between saving and copying.
        Write-Log "screen recording kept on exit: $file"
        return
    }
    try {
        Show-RecordPreview $file $seconds $area
    } catch {
        Write-Log "showing the recording preview failed: $($_.Exception.Message)"
        if (Test-Path -LiteralPath $file) { try { Remove-Item -LiteralPath $file -Force } catch { } }
        try { Show-RecordFailure $_.Exception.Message } catch { }
    }
}

function Cancel-ScreenRecord([bool]$Announce = $true) {
    # Cancelling drops the take: ffmpeg is killed rather than asked to finish,
    # because nothing of the file is going to be kept.
    $process = $SCRIPT:RecordProcess
    if ($null -eq $process) { return }
    $SCRIPT:RecordProcess = $null
    $file = $SCRIPT:RecordFile
    $SCRIPT:RecordFile = ''
    $SCRIPT:RecordArea = [System.Drawing.Rectangle]::Empty
    $SCRIPT:RecordStartedAt = [DateTime]::MinValue
    Close-RecordBar
    Close-RecordOutline
    Update-RecordMenu
    try { if (-not $process.HasExited) { $process.Kill() } } catch { }
    try { [void]$process.WaitForExit(5000) } catch { }
    try { $process.Dispose() } catch { }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (-not (Test-Path -LiteralPath $file)) { break }
        try { Remove-Item -LiteralPath $file -Force; break } catch { Start-Sleep -Milliseconds 100 }
    }
    Write-Log "screen recording cancelled: file=$file"
    if ($Announce) { Show-PetNotice $SCRIPT:Labels.RecordCancelled '' }
}

function Invoke-RecordClick {
    # The menu row and the bar reach the same two states: idle starts a selection,
    # recording stops the one in flight.
    if ($null -ne $SCRIPT:RecordProcess) { Stop-ScreenRecord; return }
    Start-RegionShot 'record'
}

# ---- menu -------------------------------------------------------------------
function Exit-Pet {
    if ($SCRIPT:Exiting) { return }
    $SCRIPT:Exiting = $true
    Save-Position
    Save-MusicPlayerState
    # A recording belongs to this process: ending the pet must finish the file
    # rather than leave ffmpeg writing to a file nobody will ever close. A preview
    # still open is dropped with the temporary file, because nobody is there to
    # choose what happens to it.
    try { Stop-ScreenRecord $false } catch { Write-Log "stopping the recording on exit failed: $($_.Exception.Message)" }
    try { Close-RecordPreview } catch { Write-Log "closing the recording preview on exit failed: $($_.Exception.Message)" }
    try { Close-RecordFrameBar } catch { }
    # The request answers itself: whatever is left of it belongs to no pet, and a
    # marker nobody removes would end the next one the moment it starts.
    try { if (Test-Path -LiteralPath $SCRIPT:QuitFile) { Remove-Item -LiteralPath $SCRIPT:QuitFile -Force } } catch { }
    try {
        if ($null -ne $SCRIPT:PetMenu) { $SCRIPT:PetMenu.Dispose() }
        $SCRIPT:PetMenu = $null
    } catch { }
    # The panel is a window of this process: closing it here means a shutdown
    # never leaves one on the desktop of an application that is gone.
    Close-QuickAccess
    try { $app.Shutdown() } catch { }
}

function New-PetMenu {
    # The plugin's only menu surface: a right-click on the pet. The panel this
    # process draws itself leads, then what the person reaches for next - the chat
    # and the repository of the Session in front, the capture - and the rest below.
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
    # Quick access opens a panel of this process's own: the current Session's
    # directory in the middle, the eight folders the person assigned around it,
    # and a click that raises whichever of them is already open. Nothing is
    # raised first - the panel is what the person asked to see - so it leads the
    # menu, ahead of the entries that hand work to the page.
    $quickItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.QuickAccess 'folder'
    $quickItem.add_Click({
        try { Start-QuickAccess } catch {
            Write-Log "opening the quick access panel failed: $($_.Exception.Message)"
            try { Show-PetNotice $SCRIPT:Labels.QuickAccessFailed $_.Exception.Message } catch { }
        }
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
    # The Git page is the plugin's own tab type, so unlike Chat it needs nothing
    # shipped besides the right Sidebar; the page reads the repository of whatever
    # Session is in front. Showing DSH first is the same requirement. It sits right
    # under Chat because both open something about the conversation in front.
    $gitItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Git 'git'
    $gitItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'git'
        } catch { Write-Log $_.Exception.Message }
    })
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
    # The site library: one entry that opens DSH's own page, which is where the
    # sites are read and changed. There is no submenu: the page itself lists them,
    # and the settings card no longer keeps a second copy of that list.
    [void](New-SitesItem $menu.Items)
    # The mini games live one level down: the entry itself opens nothing, so
    # more of them can join without touching this menu's shape again. Each child
    # is a game another plugin owns, opened through that plugin's service like
    # the entries above, and therefore raises DSH for the same reason: a
    # fullscreen overlay in a hidden window is an overlay nobody sees.
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
    $fishTankItem = New-Object System.Windows.Forms.ToolStripMenuItem
    $fishTankItem.Text = $SCRIPT:Labels.FishTank
    $fishTankItem.Tag = 'fish-tank'
    $fishTankItem.AutoSize = $true
    $fishTankItem.Padding = New-Object System.Windows.Forms.Padding(40, 8, 12, 8)
    $fishTankItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'fish-tank'
        } catch { Write-Log $_.Exception.Message }
    })
    [void]$gamesItem.DropDownItems.Add($fishTankItem)
    # Music is this process's own capability, the way the capture is: the audio plays
    # here rather than in the page, so the entries act on this process - except the
    # two that need the host (filling the library in, and opening its folder) and the
    # one that opens DSH's own settings page. The submenu is rebuilt from the library
    # at every open, because a download that finished in between changes what it says
    # (see Update-MusicMenu).
    $musicItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Music 'music'
    $musicItem.DropDown.ShowImageMargin = $false
    $musicItem.DropDown.BackColor = $menu.BackColor
    $musicItem.DropDown.ForeColor = $menu.ForeColor
    $musicItem.add_DropDownOpening({
        try { Update-MusicMenu } catch { Write-Log $_.Exception.Message }
    })
    $SCRIPT:MusicMenu = $musicItem
    # Settings ends the list on both profiles: it opens a page of DSH's own rather
    # than a window this process controls, so the web profile keeps it too. The pet
    # never offers to quit itself: the plugin's own switch owns its lifetime.
    # Capabilities that live one level down sit under Special: the entry itself
    # opens nothing, so another one can join without reshaping the menu.
    $featuresItem = Add-PetMenuItem $menu.Items $SCRIPT:Labels.Features 'sparkles'
    $featuresItem.DropDown.ShowImageMargin = $false
    $featuresItem.DropDown.BackColor = $menu.BackColor
    $featuresItem.DropDown.ForeColor = $menu.ForeColor
    # The temp space is a page of DSH's own rather than a window this process
    # controls, so the click only names it and the page selects the panel: DSH
    # has to be on screen first, because a panel selected in a hidden window is
    # one nobody sees. It is the plugin's own tab type the way the Git page is,
    # so nothing shipped has to be present for the entry to work.
    # Video clip is this process's own window, like the capture: it downloads and
    # cuts the file by itself, so nothing of DSH has to be raised first. It opens
    # a second script that draws the window (see Start-VideoClip).
    $videoClipItem = Add-PetMenuItem $featuresItem.DropDownItems $SCRIPT:Labels.VideoClip 'video'
    $videoClipItem.add_Click({
        try { Start-VideoClip } catch {
            Write-Log "opening the video clip window failed: $($_.Exception.Message)"
            try { Show-PetNotice $SCRIPT:Labels.VideoClipFailed $_.Exception.Message } catch { }
        }
    })
    # Screen recording is this process's own capability too, and the one row that
    # changes meaning: idle it opens the selection sheet, and while ffmpeg runs it
    # stops the recording (see Update-RecordMenu).
    $recordItem = Add-PetMenuItem $featuresItem.DropDownItems $SCRIPT:Labels.Record 'record'
    $SCRIPT:RecordMenuItems = @($recordItem)
    $recordItem.add_Click({
        try { Invoke-RecordClick } catch {
            Write-Log "screen recording failed: $($_.Exception.Message)"
            try { Show-RecordFailure $_.Exception.Message } catch { }
        }
    })
    # Dropping the take is its own row, visible only while one runs: ending keeps
    # the file, cancelling throws it away.
    $recordCancelItem = Add-PetMenuItem $featuresItem.DropDownItems $SCRIPT:Labels.RecordCancel 'stop'
    $SCRIPT:RecordCancelMenuItems = @($recordCancelItem)
    $recordCancelItem.Available = $false
    $recordCancelItem.add_Click({
        try { Cancel-ScreenRecord } catch {
            Write-Log "cancelling the recording failed: $($_.Exception.Message)"
        }
    })
    $featuresItem.add_DropDownOpening({
        try { Update-RecordMenu } catch { Write-Log $_.Exception.Message }
    })
    Update-RecordMenu
    $tempSpaceItem = Add-PetMenuItem $featuresItem.DropDownItems $SCRIPT:Labels.TempSpace 'folder'
    $tempSpaceItem.add_Click({
        try {
            Show-DshWindow
            Send-MenuCommand 'temp-space'
        } catch { Write-Log $_.Exception.Message }
    })
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
    # The card is 220 wide, so every row is 208: the menu's own padding stays empty
    # and the chevrons land on the same edge instead of trailing each label.
    Set-PetMenuRowWidths $menu 208
    return $menu
}

# ---- interaction ------------------------------------------------------------
$window.Add_MouseEnter({ try { $SCRIPT:Hovered = $true; $SCRIPT:DshInFront = Get-DshInFront; Update-PetOpacity } catch { } })
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

        # Music: the library the host publishes moves on its own clock - a download
        # that finished, a volume the settings card changed, a command from that card
        # - so it is read when its file moves rather than on the state file's tick.
        try {
            $musicItem = Get-Item -LiteralPath $SCRIPT:MusicFile -ErrorAction Stop
            if ($musicItem.LastWriteTime -ne $SCRIPT:MusicStamp) {
                $SCRIPT:MusicStamp = $musicItem.LastWriteTime
                if (Read-MusicLibrary) {
                    Apply-MusicLibrary
                    Apply-MusicCommand $SCRIPT:MusicLibrary
                    Apply-MusicNotice $SCRIPT:MusicLibrary
                }
            }
        } catch { }

        # Somebody else's audio decides whether this keeps playing: sampled once a
        # second, which is also the hysteresis - a notification ding does not last
        # two samples, and the silence between two videos does. The configuration
        # arrives with the library above, so a switch turned off in the settings card
        # stops the sampling entirely.
        if ($SCRIPT:MusicDuck -and ($SCRIPT:Ticks % 5) -eq 0) { Update-MusicDuck }

        # Keep the resume position fresh while something plays: this file is both what
        # the settings card shows and what the next start picks up from.
        if ($SCRIPT:MusicPlaying -and ($SCRIPT:Ticks % 25) -eq 0) { Save-MusicPlayerState }

        # A volume the slider is still being dragged through writes nothing until it
        # settles; this is where the settled value becomes a command.
        Update-MusicVolumeCommit

        # A recording that ended on its own - ffmpeg failed, the disk filled - must
        # not leave a bar counting a process that is gone.
        if ($null -ne $SCRIPT:RecordProcess) {
            $recordEnded = $false
            try { $recordEnded = $SCRIPT:RecordProcess.HasExited } catch { $recordEnded = $true }
            if ($recordEnded) { Stop-ScreenRecord }
        }

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

if ($MenuProbe -ne '') {
    # The menu the person actually right-clicks, laid out and drawn while the window
    # itself stays hidden: a row narrower than its card puts the chevron against the
    # label instead of on the card's edge, and nothing but the laid-out menu can say
    # how wide its rows came out.
    $probeMenu = $SCRIPT:PetMenu
    $probeMenu.Show([System.Drawing.Point]::new(-4000, -4000))
    [System.Windows.Forms.Application]::DoEvents()
    Write-Output "menu-card: $($probeMenu.Width)x$($probeMenu.Height)"
    foreach ($item in $probeMenu.Items) {
        if ($item -isnot [System.Windows.Forms.ToolStripMenuItem]) { continue }
        Write-Output "menu-row: $($item.Text)|$($item.Width)|$($item.Height)|$($item.HasDropDownItems)"
    }
    # One submenu is enough to prove the rows inside one are sized the same way; the
    # mini games are the first one this menu builds for itself.
    $probeChild = @($probeMenu.Items | Where-Object {
        $_ -is [System.Windows.Forms.ToolStripMenuItem] -and $_.HasDropDownItems
    }) | Select-Object -First 1
    if ($null -ne $probeChild) {
        $probeChild.DropDown.Show($probeMenu, [System.Drawing.Point]::new(0, $probeChild.Bounds.Top))
        [System.Windows.Forms.Application]::DoEvents()
        Write-Output "menu-sub-card: $($probeChild.DropDown.Width)x$($probeChild.DropDown.Height)"
        foreach ($item in $probeChild.DropDown.Items) {
            if ($item -isnot [System.Windows.Forms.ToolStripMenuItem]) { continue }
            $wanted = $item.GetPreferredSize([System.Drawing.Size]::Empty).Width
            Write-Output "menu-sub-row: $($item.Text)|$($item.Width)|$($item.Height)|$($item.HasDropDownItems)|$wanted"
        }
        $probeChild.DropDown.Close()
    }
    # Every submenu, not just the first: the capabilities this process owns itself
    # hang under Special, and the recording row is the one whose label changes with
    # its state. A probe that only looked at the first submenu would miss them.
    foreach ($item in $probeMenu.Items) {
        if ($item -isnot [System.Windows.Forms.ToolStripMenuItem] -or -not $item.HasDropDownItems) { continue }
        foreach ($child in $item.DropDownItems) {
            if ($child -isnot [System.Windows.Forms.ToolStripMenuItem]) { continue }
            # A row that is only there while a recording runs is not part of the
            # idle menu, and the probe reports the menu a person actually sees.
            if (-not $child.Available) { continue }
            Write-Output "menu-child-row: $($item.Text)|$($child.Text)|$($child.Tag)|$($child.Enabled)"
        }
    }
    $probeBitmap = New-Object System.Drawing.Bitmap($probeMenu.Width, $probeMenu.Height)
    $probeMenu.DrawToBitmap($probeBitmap,
        (New-Object System.Drawing.Rectangle(0, 0, $probeMenu.Width, $probeMenu.Height)))
    # Where the chevron actually came out: it has to be drawn, and inside the last few
    # pixels of the row, or a label has taken its place.
    foreach ($item in $probeMenu.Items) {
        if ($item -isnot [System.Windows.Forms.ToolStripMenuItem] -or -not $item.HasDropDownItems) { continue }
        $low = 0
        $high = 0
        for ($x = [Math]::Max(0, $item.Width - 40); $x -lt $item.Width - 4; $x++) {
            for ($y = $item.Bounds.Top; $y -lt $item.Bounds.Bottom; $y++) {
                $pixel = $probeBitmap.GetPixel($x, $y)
                if ($pixel.R -lt 170 -and $pixel.G -lt 170) {
                    if ($low -eq 0) { $low = $x }
                    $high = $x
                    break
                }
            }
        }
        Write-Output "menu-arrow: $($item.Text)|$low|$high"
    }
    $probeBitmap.Save($MenuProbe, [System.Drawing.Imaging.ImageFormat]::Png)
    $probeBitmap.Dispose()
    $probeMenu.Close()
    $probeMenu.Dispose()
    exit 0
}



if ($ShotPreviewProbe -ne '') {
    # The preview window over a synthetic capture: no screen, no shutter, and no
    # file. What it proves is the part a person reads before anything is written -
    # the picture, its size, the path, and the three buttons - drawn off screen.
    $probeShot = [System.Drawing.Rectangle]::new(0, 0, 320, 200)
    $probeCapture = New-Object System.Drawing.Bitmap($probeShot.Width, $probeShot.Height)
    $probeGraphics = [System.Drawing.Graphics]::FromImage($probeCapture)
    try {
        $probeGraphics.Clear([System.Drawing.Color]::FromArgb(28, 32, 40))
        $probeGraphics.FillRectangle([System.Drawing.Brushes]::SteelBlue, 24, 24, 150, 90)
        $probeGraphics.FillRectangle([System.Drawing.Brushes]::Orange, 190, 110, 90, 60)
    } finally {
        $probeGraphics.Dispose()
    }
    $SCRIPT:ShotPreviewPath = Get-ShotFileName
    $probeFont = Get-QuickAccessFont 9 $false
    try { $probeMetrics = Get-ShotPreviewMetrics $probeShot.Width $probeShot.Height $probeFont }
    finally { $probeFont.Dispose() }
    $probeImage = New-Object System.Drawing.Bitmap($probeMetrics.Width, $probeMetrics.Height,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $probeGraphics = [System.Drawing.Graphics]::FromImage($probeImage)
    try {
        Draw-ShotPreview $probeGraphics $probeMetrics $probeCapture $SCRIPT:ShotPreviewPath -1 -1
        $probeImage.Save($ShotPreviewProbe, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $probeGraphics.Dispose()
        $probeImage.Dispose()
    }
    Write-Output "shot-preview-probe: $($probeMetrics.Width)x$($probeMetrics.Height)"
    # The window itself, built but never shown: the drawing above proves the layout,
    # and this proves the borderless form behind it exists at that size.
    $probeForm = New-ShotPreviewForm $probeCapture $probeShot
    try {
        Write-Output "shot-preview-window: $($probeForm.Form.ClientSize.Width)x$($probeForm.Form.ClientSize.Height)"
    } finally {
        $probeForm.Form.Dispose()
    }
    Write-Output ("shot-preview-buttons: " + $SCRIPT:Labels.ShotSave + '|' + $SCRIPT:Labels.ShotCopy + '|' +
        $SCRIPT:Labels.ShotCancel)
    $probeCapture.Dispose()
    exit 0
}

if ($RecordBarProbe -ne '') {
    # The recording bar off screen: laid out from the font, painted through the
    # routine the window paints with, and built once as the real borderless form.
    # A bar measured too narrow clips its stop label, which is what a display
    # scale other than 100% would do to a layout pinned to 96dpi pixels.
    $probeBarFont = Get-QuickAccessFont 9 $true
    try {
        $probeBarMetrics = Get-RecordBarLayout $probeBarFont
        $probeBarClock = $SCRIPT:Labels.RecordBarPrefix + ' ' + (Format-RecordClock 65000)
        $probeBarImage = New-Object System.Drawing.Bitmap($probeBarMetrics.Width, $probeBarMetrics.Height,
            [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $probeBarGraphics = [System.Drawing.Graphics]::FromImage($probeBarImage)
            try {
                Draw-RecordBar $probeBarGraphics $probeBarMetrics $probeBarFont $probeBarClock $false
            } finally {
                $probeBarGraphics.Dispose()
            }
            $probeBarImage.Save($RecordBarProbe, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $probeBarImage.Dispose()
        }
        Write-Output "record-bar-probe: $($probeBarMetrics.Width)x$($probeBarMetrics.Height)"
        Write-Output ("record-bar-stop: " + $probeBarMetrics.StopLeft + ',' +
            [int](($probeBarMetrics.Height - $probeBarMetrics.StopHeight) / 2) + ',' +
            $probeBarMetrics.StopWidth + 'x' + $probeBarMetrics.StopHeight)
        Write-Output ("record-bar-cancel: " + $probeBarMetrics.CancelLeft + ',' +
            [int](($probeBarMetrics.Height - $probeBarMetrics.StopHeight) / 2) + ',' +
            $probeBarMetrics.CancelWidth + 'x' + $probeBarMetrics.StopHeight)
        $probeBar = New-RecordBar $probeBarMetrics $probeBarFont
        try {
            Write-Output "record-bar-window: $($probeBar.ClientSize.Width)x$($probeBar.ClientSize.Height)"
        } finally {
            $probeBar.Dispose()
        }
    } finally {
        $probeBarFont.Dispose()
    }
    exit 0
}

if ($RecordPreviewProbe -ne '') {
    # The recording preview off screen: the real WPF player layout, measured and
    # arranged without showing it, rendered to a PNG. What it proves is what a
    # person reads after a take: the player, the seek bar, the length, the size,
    # the folder, and the three ways out of it.
    $probeArea = [System.Drawing.Rectangle]::new(0, 0, 320, 200)
    $probePath = 'D:\AI\Tmp\record\record-20260101-120000.mp4'
    $probeWindow = New-RecordPreviewWindow $probePath 65 $probeArea
    $probeRoot = $probeWindow.Content
    $probeRoot.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
    $probeSize = $probeRoot.DesiredSize
    $probeRoot.Arrange([System.Windows.Rect]::new(0, 0, $probeSize.Width, $probeSize.Height))
    $probeRoot.UpdateLayout()
    $probeWidth = [int][Math]::Ceiling($probeSize.Width)
    $probeHeight = [int][Math]::Ceiling($probeSize.Height)
    $probeBitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($probeWidth, $probeHeight, 96, 96,
        [System.Windows.Media.PixelFormats]::Pbgra32)
    $probeBitmap.Render($probeRoot)
    $probeEncoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $probeEncoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($probeBitmap))
    $probeStream = [System.IO.File]::Create($RecordPreviewProbe)
    try { $probeEncoder.Save($probeStream) } finally { $probeStream.Dispose() }
    Write-Output "record-preview-probe: $($probeWidth)x$($probeHeight)"
    Write-Output "record-preview-window: $([int]$probeSize.Width)x$([int]$probeSize.Height)"
    Write-Output ("record-preview-buttons: " + $SCRIPT:Labels.RecordSave + '|' + $SCRIPT:Labels.RecordCopy + '|' +
        $SCRIPT:Labels.RecordPreviewCancel)
    try { Close-RecordPreviewMedia } catch { }
    exit 0
}

if ($RecordPlayProbe -ne '') {
    # The preview on a real file with the real player shown on screen: open it, let
    # the first frame arrive, write the window to $RecordPlayProbe.png, and report
    # what the transport did. A preview that opens black, or whose pause does not
    # hold, is exactly what this measures - the off-screen probe cannot see either.
    $playProbeVideo = [System.IO.Path]::GetFullPath($RecordPlayProbe)
    if (-not (Test-Path -LiteralPath $playProbeVideo)) { Write-Output 'record-play-probe: failed no-file'; exit 1 }
    $playProbeArea = [System.Drawing.Rectangle]::new(0, 0, 480, 270)
    $playProbeWindow = New-RecordPreviewWindow $playProbeVideo 1 $playProbeArea
    $playProbeWindow.Topmost = $false
    $playProbeWindow.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $playProbeWindow.Left = 80
    $playProbeWindow.Top = 80
    $SCRIPT:RecordPreview = $playProbeWindow
    $playProbeWindow.Show()
    $playProbeWindow.Activate()
    $playProbeDeadline = [DateTime]::UtcNow.AddSeconds(12)
    while (-not $SCRIPT:RecordPreviewMedia.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $playProbeDeadline) {
        $playFrame = New-Object System.Windows.Threading.DispatcherFrame
        $playTimer = New-Object System.Windows.Threading.DispatcherTimer
        $playTimer.Interval = [TimeSpan]::FromMilliseconds(150)
        $playTimer.Add_Tick({ $playFrame.Continue = $false; $playTimer.Stop() })
        $playTimer.Start()
        [System.Windows.Threading.Dispatcher]::PushFrame($playFrame)
    }
    # Let the poster settle before the shutter.
    $playFrame = New-Object System.Windows.Threading.DispatcherFrame
    $playTimer = New-Object System.Windows.Threading.DispatcherTimer
    $playTimer.Interval = [TimeSpan]::FromMilliseconds(900)
    $playTimer.Add_Tick({ $playFrame.Continue = $false; $playTimer.Stop() })
    $playTimer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($playFrame)

    $playProbeMedia = $SCRIPT:RecordPreviewMedia
    $playProbeDuration = 0
    try { if ($playProbeMedia.NaturalDuration.HasTimeSpan) { $playProbeDuration = $playProbeMedia.NaturalDuration.TimeSpan.TotalSeconds } } catch { }
    $playProbePosition = [Math]::Round($playProbeMedia.Position.TotalSeconds, 2)
    $playProbeMediaWidth = $playProbeMedia.NaturalVideoWidth
    $playProbeMediaHeight = $playProbeMedia.NaturalVideoHeight
    $playProbePlaying = $SCRIPT:RecordPreviewPlaying
    $playProbeButton = ''
    try { $playProbeButton = $SCRIPT:RecordPreviewPlayText.Text } catch { }

    # Shutter: the window as the person sees it, media plate included. A probe that
    # is not the foreground process cannot rely on Activate() alone, and a capture
    # of whatever window happens to be in front would score as a preview.
    $playProbeWindow.Activate()
    try { [void][DshPet.Win32]::SetForegroundWindow([System.Windows.Interop.WindowInteropHelper]::new($playProbeWindow).Handle) } catch { }
    $playFrame = New-Object System.Windows.Threading.DispatcherFrame
    $playTimer = New-Object System.Windows.Threading.DispatcherTimer
    $playTimer.Interval = [TimeSpan]::FromMilliseconds(450)
    $playTimer.Add_Tick({ $playFrame.Continue = $false; $playTimer.Stop() })
    $playTimer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($playFrame)
    $playProbeBitmap = $null
    try {
        $playProbeBounds = $playProbeWindow.PointToScreen([System.Windows.Point]::new(0, 0))
        $playProbeRect = [System.Drawing.Rectangle]::new(
            [int]$playProbeBounds.X, [int]$playProbeBounds.Y,
            [int]$playProbeWindow.ActualWidth, [int]$playProbeWindow.ActualHeight)
        # A margin of desktop around it: the window's own corners are what says
        # whether the rounded region took.
        $playProbeRect.Inflate(20, 20)
        $playProbeBitmap = New-Object System.Drawing.Bitmap($playProbeRect.Width, $playProbeRect.Height)
        $playProbeGraphics = [System.Drawing.Graphics]::FromImage($playProbeBitmap)
        try { $playProbeGraphics.CopyFromScreen($playProbeRect.Location, [System.Drawing.Point]::Empty, $playProbeRect.Size) }
        finally { $playProbeGraphics.Dispose() }
        $playProbeBitmap.Save(($RecordPlayProbe + '.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $playProbeSum = 0.0
        $playProbeSamples = 0
        for ($playY = 0; $playY -lt $playProbeBitmap.Height; $playY += 8) {
            for ($playX = 0; $playX -lt $playProbeBitmap.Width; $playX += 8) {
                $playPixel = $playProbeBitmap.GetPixel($playX, $playY)
                $playProbeSum += (0.2126 * $playPixel.R + 0.7152 * $playPixel.G + 0.0722 * $playPixel.B)
                $playProbeSamples++
            }
        }
        $playProbeLuma = if ($playProbeSamples -gt 0) { [Math]::Round(($playProbeSum / $playProbeSamples), 1) } else { 0 }
    } finally {
        if ($null -ne $playProbeBitmap) { $playProbeBitmap.Dispose() }
    }

    # Pause must hold: press it the way the transport does, then check that the
    # playhead did not move while time passed.
    $SCRIPT:RecordPreviewPlaying = $true
    $playProbeMedia.Play()
    $playFrame = New-Object System.Windows.Threading.DispatcherFrame
    $playTimer = New-Object System.Windows.Threading.DispatcherTimer
    $playTimer.Interval = [TimeSpan]::FromMilliseconds(700)
    $playTimer.Add_Tick({ $playFrame.Continue = $false; $playTimer.Stop() })
    $playTimer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($playFrame)
    $playProbeBeforePause = $playProbeMedia.Position.TotalSeconds
    $playProbeMedia.Pause()
    $SCRIPT:RecordPreviewPlaying = $false
    $playFrame = New-Object System.Windows.Threading.DispatcherFrame
    $playTimer = New-Object System.Windows.Threading.DispatcherTimer
    $playTimer.Interval = [TimeSpan]::FromMilliseconds(900)
    $playTimer.Add_Tick({ $playFrame.Continue = $false; $playTimer.Stop() })
    $playTimer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($playFrame)
    $playProbeAfterPause = $playProbeMedia.Position.TotalSeconds

    # The card moves by its header. Mouse input is posted for real because DragMove
    # only runs inside a real press, and the release has to arrive from the same
    # pump the drag is pumping, so the move and the release come from a timer.
    $playProbeWindow.Activate()
    try { [void][DshPet.Win32]::SetForegroundWindow([System.Windows.Interop.WindowInteropHelper]::new($playProbeWindow).Handle) } catch { }
    $playDragFrom = $playProbeWindow.PointToScreen([System.Windows.Point]::new(70, 34))
    $playDragOrigin = [System.Windows.Point]::new($playProbeWindow.Left, $playProbeWindow.Top)
    $script:playDragStartX = [int]$playDragFrom.X
    $script:playDragStartY = [int]$playDragFrom.Y
    $script:playDragTicks = 0
    $script:playDragTimer = New-Object System.Windows.Threading.DispatcherTimer
    $script:playDragTimer.Interval = [TimeSpan]::FromMilliseconds(200)
    $script:playDragTimer.Add_Tick({
        $script:playDragTicks++
        if ($script:playDragTicks -eq 1) {
            [void][DshPet.Win32]::SetCursorPos(($script:playDragStartX + 130), ($script:playDragStartY + 90))
        } else {
            [DshPet.Win32]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
            $script:playDragTimer.Stop()
        }
    })
    [void][DshPet.Win32]::SetCursorPos($script:playDragStartX, $script:playDragStartY)
    Start-Sleep -Milliseconds 120
    $script:playDragTimer.Start()
    [DshPet.Win32]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
    $playDragWait = New-Object System.Windows.Threading.DispatcherFrame
    $playDragWaitTimer = New-Object System.Windows.Threading.DispatcherTimer
    $playDragWaitTimer.Interval = [TimeSpan]::FromMilliseconds(2000)
    $playDragWaitTimer.Add_Tick({ $script:playDragWaitTimer.Stop(); $script:playDragWait.Continue = $false })
    $script:playDragWait = $playDragWait
    $script:playDragWaitTimer = $playDragWaitTimer
    $playDragWaitTimer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($playDragWait)
    $playDragMoved = [System.Windows.Point]::new($playProbeWindow.Left, $playProbeWindow.Top)
    $playDragDistance = [int]([Math]::Abs($playDragMoved.X - $playDragOrigin.X) + [Math]::Abs($playDragMoved.Y - $playDragOrigin.Y))
    try { $playProbeWindow.Left = $playDragOrigin.X; $playProbeWindow.Top = $playDragOrigin.Y } catch { }

    Write-Output ("record-play-probe: natural=$($playProbeMediaWidth)x$($playProbeMediaHeight) duration=$([Math]::Round($playProbeDuration, 2))")
    Write-Output ("record-play-poster: position=$playProbePosition playing=$playProbePlaying button=$playProbeButton luma=$playProbeLuma")
    Write-Output ("record-play-pause: before=$([Math]::Round($playProbeBeforePause, 2)) after=$([Math]::Round($playProbeAfterPause, 2)) drift=$([Math]::Round(($playProbeAfterPause - $playProbeBeforePause), 2))")
    Write-Output ("record-play-drag: from=$([int]$playDragOrigin.X),$([int]$playDragOrigin.Y) to=$([int]$playDragMoved.X),$([int]$playDragMoved.Y) distance=$playDragDistance")
    Write-Output ("record-play-picture: " + $RecordPlayProbe + '.png')
    try { Close-RecordPreviewMedia } catch { }
    try { $playProbeWindow.Close() } catch { }
    exit 0
}

if ($RecordSheetProbe -ne '') {
    # The selection sheet driven the way a person drives it: a press, a drag that
    # must be visible while it happens, a release that leaves a frame, and Escape
    # from the frame's own start window. Every one of those is a fact about a live
    # window that cannot be read off the script, so this shows it and reports what
    # the window looked like at each step.
    $sheetProbeDir = [System.IO.Path]::GetFullPath($RecordSheetProbe)
    if (-not (Test-Path -LiteralPath $sheetProbeDir)) { [void][System.IO.Directory]::CreateDirectory($sheetProbeDir) }

    function Invoke-SheetProbeFrames([int]$Milliseconds) {
        $deadline = [DateTime]::UtcNow.AddMilliseconds($Milliseconds)
        while ([DateTime]::UtcNow -lt $deadline) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 30
        }
    }

    function Save-SheetProbeShot([string]$Path, [System.Drawing.Rectangle]$Area) {
        $bitmap = New-Object System.Drawing.Bitmap($Area.Width, $Area.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try { $graphics.CopyFromScreen($Area.Location, [System.Drawing.Point]::Empty, $Area.Size) }
        finally { $graphics.Dispose() }
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        # The frame is the sheet's blue stroke dimmed by the sheet's own opacity, so
        # it is counted by hue rather than by the exact colour it was drawn with.
        $blues = 0
        for ($probeY = 0; $probeY -lt $bitmap.Height; $probeY += 2) {
            for ($probeX = 0; $probeX -lt $bitmap.Width; $probeX += 2) {
                $pixel = $bitmap.GetPixel($probeX, $probeY)
                if (($pixel.B -gt ($pixel.R + 25)) -and ($pixel.B -gt ($pixel.G + 10)) -and $pixel.B -gt 90) { $blues++ }
            }
        }
        $bitmap.Dispose()
        return $blues
    }

    Start-RegionShot 'record'
    Invoke-SheetProbeFrames 600
    $sheetForm = $SCRIPT:ShotOverlay
    $focusBefore = if ($null -eq [System.Windows.Forms.Form]::ActiveForm) { 'none' }
        else { $SCRIPT:ShotOverlay -eq [System.Windows.Forms.Form]::ActiveForm }

    $downArgs = [pscustomobject]@{ Button = [System.Windows.Forms.MouseButtons]::Left; Location = [System.Drawing.Point]::new(300, 260) }
    $moveArgs = [pscustomobject]@{ Button = [System.Windows.Forms.MouseButtons]::Left; Location = [System.Drawing.Point]::new(760, 560) }
    $otherArgs = [pscustomobject]@{ Button = [System.Windows.Forms.MouseButtons]::Left; Location = [System.Drawing.Point]::new(840, 610) }
    $upArgs = [pscustomobject]@{ Button = [System.Windows.Forms.MouseButtons]::Left; Location = [System.Drawing.Point]::new(840, 610) }

    Invoke-RecordSheetDown $sheetForm $downArgs
    Invoke-RecordSheetMove $sheetForm $moveArgs
    Invoke-SheetProbeFrames 120
    $dragArea = [System.Drawing.Rectangle]::new(260, 220, 640, 460)
    $dragBlues = Save-SheetProbeShot (Join-Path $sheetProbeDir 'dragging.png') $dragArea
    $dragSelection = $SCRIPT:ShotSelection

    Invoke-RecordSheetMove $sheetForm $otherArgs
    Invoke-SheetProbeFrames 120
    $laterBlues = Save-SheetProbeShot (Join-Path $sheetProbeDir 'dragging-further.png') $dragArea

    Invoke-RecordSheetUp $sheetForm $upArgs
    Invoke-SheetProbeFrames 300
    $adjustedFrame = $SCRIPT:RecordFrame
    $barShown = $null -ne $SCRIPT:RecordFrameBar
    $frameBlues = Save-SheetProbeShot (Join-Path $sheetProbeDir 'frame.png') $dragArea
    $focusAfterBar = if ($null -eq [System.Windows.Forms.Form]::ActiveForm) { 'none' }
        else { $SCRIPT:ShotOverlay -eq [System.Windows.Forms.Form]::ActiveForm }
    $focusAfterBarName = if ($null -eq [System.Windows.Forms.Form]::ActiveForm) { 'none' }
        else { [System.Windows.Forms.Form]::ActiveForm.GetType().Name }

    # Escape is heard by whichever window has the focus, and the start window is a
    # window of its own: the probe presses the key rather than closing behind it.
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    Invoke-SheetProbeFrames 400
    $closedByEscape = $null -eq $SCRIPT:ShotOverlay

    Write-Output ("record-sheet-focus: before=$focusBefore after-bar=$focusAfterBar form=$focusAfterBarName")
    Write-Output ("record-sheet-drag: selection=$($dragSelection.Width)x$($dragSelection.Height) blues=$dragBlues further=$laterBlues")
    Write-Output ("record-sheet-frame: area=$($adjustedFrame.Width)x$($adjustedFrame.Height) at=$($adjustedFrame.X),$($adjustedFrame.Y) bar=$barShown blues=$frameBlues")
    Write-Output ("record-sheet-escape: closed=$closedByEscape")
    Write-Output ("record-sheet-pictures: " + $sheetProbeDir)
    if (-not $closedByEscape) { try { Close-ShotOverlay } catch { } }
    exit 0
}

# Apply the state first (it fixes the window size), then place the window and
# clamp it onto a screen.
Apply-State (Read-Json $SCRIPT:StateFile)
Restore-Position
# What this machine was playing, read before the first tick so the library that
# arrives next can be resumed rather than started from the top.
Restore-MusicPlayerState
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
