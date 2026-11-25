<#
.SYNOPSIS
    Download one time range of a Bilibili video, opened from the pet's Special menu.

.DESCRIPTION
    A window of its own, started by pet.ps1: the link, the start and end time, and
    the folder the clip is written to. The range is fetched by yt-dlp - the
    `yt_dlp` Python module or an `yt-dlp` executable - and cut by ffmpeg, so only
    the requested stretch travels over the network rather than the whole video.

    The default folder is the one the settings card configured (the pet passes it
    in as -DefaultDir); a folder typed in the window is remembered for the next
    run in a small JSON file beside the pet's state file. ffmpeg is looked for
    next to this plugin, under the harness home, on PATH, and in $env:DSH_FFMPEG,
    in that order, and downloaded into the harness home once when none is found.

    Every byte of this script stays ASCII so Windows PowerShell 5.1 decodes it the
    same way whatever an editor saves: the localized labels live in labels.json,
    which is read as UTF-8 and falls back to the English defaults below.

.PARAMETER DefaultDir
    Folder the window starts with. The settings card's value, or blank.

.PARAMETER LabelsFile
    labels.json to read the localized strings from; missing entries use English.

.PARAMETER FfmpegHome
    Directory holding ffmpeg.exe, when the caller already knows where it is.

.PARAMETER SelfTest
    Parse the sample inputs, print what they became as JSON, and exit. No window
    is opened, so a broken parser fails here instead of at the first download.
#>
param(
    [string]$DefaultDir = '',
    [string]$LabelsFile = '',
    [string]$FfmpegHome = '',
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

# ---- labels -----------------------------------------------------------------

# The window's own strings travel beside this script, so the pet's labels file
# stays the pet's: both are read as UTF-8 and both fall back to the English here.
if ([string]::IsNullOrWhiteSpace($LabelsFile)) {
    $defaultLabels = Join-Path $PSScriptRoot 'video-clip.labels.json'
    if (Test-Path -LiteralPath $defaultLabels -PathType Leaf) { $LabelsFile = $defaultLabels }
}

$SCRIPT:DefaultLabels = @{
    VideoClipTitle          = 'Video clip'
    VideoClipIntro          = 'Paste a Bilibili link to save the whole video, or tick "Cut a section only" and give the two times.'
    VideoClipUrl            = 'Link'
    VideoClipUrlHint        = 'A bilibili.com address (with ?p=2 it is episode 2), a BV or av id, or a b23.tv short link'
    VideoClipStart          = 'Start'
    VideoClipEnd            = 'End'
    VideoClipRange          = 'Cut a section only'
    VideoClipTimeHint       = '00:12:30 or 750'
    VideoClipDir            = 'Save to'
    VideoClipBrowse         = 'Browse...'
    VideoClipOpen           = 'Open'
    VideoClipQuality        = 'Quality'
    VideoClipQualityAuto    = 'Best available'
    VideoClipQuality1080    = 'Up to 1080P'
    VideoClipQuality720     = 'Up to 720P'
    VideoClipQuality480     = 'Up to 480P'
    VideoClipPrecise        = 'Cut exactly (re-encode, slower)'
    VideoClipLogin          = 'Login state'
    VideoClipLoginNone      = 'Not used'
    VideoClipLoginScan      = 'Signed in (QR code)'
    VideoClipLoginPending   = 'Not signed in (scan first)'
    VideoClipLoginUser      = 'Signed in: {0}'
    VideoClipScan           = 'Scan...'
    VideoClipScanTitle      = 'Sign in to Bilibili'
    VideoClipScanHint       = 'Scan this with the Bilibili app, then confirm on the phone.'
    VideoClipScanWaiting    = 'Waiting for the scan...'
    VideoClipScanScanned    = 'Scanned. Confirm it on the phone.'
    VideoClipScanOk         = 'Signed in as {0}.'
    VideoClipScanExpired    = 'The code expired. Open the scan window again.'
    VideoClipScanFailed     = 'The sign-in could not be completed: {0}'
    VideoClipScanNeedsPy    = 'Showing the code needs the segno Python package: pip install segno'
    VideoClipLoginFirst     = 'Scan the code first, or set Login state back to "Not used".'
    VideoClipCookieFile     = 'Bilibili cookies: {0}'
    VideoClipDownload       = 'Download'
    VideoClipCancel         = 'Cancel'
    VideoClipClose          = 'Close'
    VideoClipReady          = 'Ready.'
    VideoClipPreparing      = 'Preparing...'
    VideoClipDownloading    = 'Downloading {0}'
    VideoClipDone           = 'Saved: {0}'
    VideoClipDoneSize       = 'Saved ({0}): {1}'
    VideoClipFailed         = 'The download failed. See the log below.'
    VideoClipCancelled      = 'Cancelled.'
    VideoClipBadUrl         = 'Enter a Bilibili link, a BV id, or a b23.tv address.'
    VideoClipBadTime        = 'Start and end must be a time like 00:12:30, or seconds.'
    VideoClipBadRange       = 'The end has to come after the start.'
    VideoClipBadDir         = 'Choose the folder the clip is saved to.'
    VideoClipNoYtdlp        = 'yt-dlp was not found. Install it with "pip install yt-dlp" and open this window again.'
    VideoClipFfmpegWait     = 'ffmpeg is missing, so it is being downloaded once (about 200 MB)...'
    VideoClipFfmpegReady    = 'ffmpeg is ready.'
    VideoClipFfmpegFailed   = 'ffmpeg could not be downloaded. See the log below.'
    VideoClipFfmpegDir      = 'ffmpeg: {0}'
    VideoClipYtdlpDir       = 'yt-dlp: {0}'
    VideoClipCookieRetry    = 'The browser login state could not be read, so this is retried without it (Bilibili then serves the formats that need no sign-in).'
    VideoClipCookieTip      = 'Edge and Chrome lock their cookie database while they run; close the browser, or leave Login state on "Not used", to keep the signed-in formats.'
    VideoClipExitCode       = 'yt-dlp exit code: {0}'
    VideoClipRepairing      = 'Fixing the cut timestamps (re-encoding {0:0.#} s)...'
    VideoClipRunning        = 'A download is already running.'
    VideoClipOpenFailed     = 'That folder could not be opened.'
    VideoClipLogEmpty       = ''
}

$SCRIPT:Labels = $SCRIPT:DefaultLabels

function Read-Labels([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    try {
        $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
        $parsed = $text | ConvertFrom-Json
    } catch {
        return
    }
    foreach ($name in @($SCRIPT:DefaultLabels.Keys)) {
        $value = $parsed.$name
        if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
            $SCRIPT:Labels[$name] = [string]$value
        }
    }
}

function T([string]$Name) {
    $value = $SCRIPT:Labels[$Name]
    if ($null -eq $value) { return $Name }
    return [string]$value
}

# ---- small helpers ----------------------------------------------------------

function Get-DshHome {
    $raw = $env:DSH_HOME
    $value = if ($null -eq $raw) { '' } else { $raw.Trim() }
    if ($value -eq '') { return (Join-Path $HOME '.dsh') }
    if ($value -eq '~') { return $HOME }
    if ($value.StartsWith('~/') -or $value.StartsWith('~\')) { return (Join-Path $HOME $value.Substring(2)) }
    return [System.IO.Path]::GetFullPath($value)
}

# "12:30", "1:02:03" and a plain number of seconds all name one offset; anything
# else is -1, which the window reports as a bad time rather than as zero.
function ConvertTo-Seconds([string]$Text) {
    if ($null -eq $Text) { return -1 }
    $t = $Text.Trim()
    if ($t -eq '') { return -1 }
    if ($t -match '^\d+$') { return [int]$t }
    if ($t -match '^\d+:\d{1,2}(:\d{1,2})?$') {
        $total = 0
        foreach ($part in $t.Split(':')) { $total = $total * 60 + [int]$part }
        return $total
    }
    return -1
}

function Format-Clock([int]$Seconds) {
    if ($Seconds -lt 0) { return '00:00' }
    $h = [int][Math]::Floor($Seconds / 3600)
    $m = [int][Math]::Floor(($Seconds % 3600) / 60)
    $s = $Seconds % 60
    if ($h -gt 0) { return ('{0}:{1:00}:{2:00}' -f $h, $m, $s) }
    return ('{0:00}:{1:00}' -f $m, $s)
}

# yt-dlp reads a section as [HH:]MM:SS, so the hours are always spelled out here
# even when the window shows a short clock.
function Format-ClockLong([int]$Seconds) {
    if ($Seconds -lt 0) { return '00:00:00' }
    return ('{0:00}:{1:00}:{2:00}' -f [int][Math]::Floor($Seconds / 3600), [int][Math]::Floor(($Seconds % 3600) / 60), ($Seconds % 60))
}

# A link, a bare BV/av id, or a b23.tv address without its scheme; blank means the
# entry cannot be used, which the window says before starting anything.
function Resolve-VideoUrl([string]$Raw) {
    if ($null -eq $Raw) { return '' }
    $t = $Raw.Trim()
    if ($t -eq '') { return '' }
    if ($t -match '^(BV[0-9A-Za-z]{10}|av\d+)$') { return "https://www.bilibili.com/video/$t" }
    if ($t -match '^https?://') { return $t }
    if ($t -match '^(www\.)?(bilibili\.com|b23\.tv)/') { return "https://$t" }
    return ''
}

function Quote-Arg([string]$Value) {
    if ($null -eq $Value) { return '""' }
    return '"' + ($Value -replace '"', '\"') + '"'
}

# ---- external tools ---------------------------------------------------------

function Find-FfmpegDir([string]$Hint) {
    $candidates = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrWhiteSpace($Hint)) { [void]$candidates.Add($Hint) }
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_FFMPEG)) { [void]$candidates.Add($env:DSH_FFMPEG) }
    # Both layouts a person ends up with: the ffmpeg folder itself, and the bin
    # inside a downloaded build.
    foreach ($root in @((Get-DshHome))) {
        [void]$candidates.Add((Join-Path $root 'tools\ffmpeg\bin'))
        [void]$candidates.Add((Join-Path $root 'tools\ffmpeg'))
    }
    foreach ($dir in $candidates) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        if (Test-Path -LiteralPath (Join-Path $dir 'ffmpeg.exe') -PathType Leaf) { return $dir }
    }
    $command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) { return [System.IO.Path]::GetDirectoryName($command.Source) }
    return ''
}

# yt-dlp is either the executable or the module; the second returns the Python
# that can run it, so the window can hand both to the process launcher.
function Find-YtDlp {
    $command = Get-Command yt-dlp.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return [pscustomobject]@{ File = $command.Source; Prefix = @() ; Name = $command.Source }
    }
    foreach ($name in @('python', 'py')) {
        $python = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -eq $python) { continue }
        $probe = & $python.Source -m yt_dlp --version 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$probe)) {
            return [pscustomobject]@{ File = $python.Source; Prefix = @('-m', 'yt_dlp'); Name = ("{0} -m yt_dlp ({1})" -f $python.Source, [string]$probe).Trim() }
        }
    }
    return $null
}

function Install-Ffmpeg([string]$TargetRoot) {
    $url = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip'
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-ffmpeg-' + [guid]::NewGuid().ToString('N'))
    [void][System.IO.Directory]::CreateDirectory($work)
    $zip = Join-Path $work 'ffmpeg.zip'
    try {
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($null -ne $curl) {
            & $curl.Source -L --fail --silent --show-error -o $zip $url
            if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        }
        $expanded = Join-Path $work 'expanded'
        Expand-Archive -LiteralPath $zip -DestinationPath $expanded -Force
        $inner = Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1
        if ($null -eq $inner) { throw 'the archive held no directory' }
        if (Test-Path -LiteralPath $TargetRoot) { Remove-Item -LiteralPath $TargetRoot -Recurse -Force }
        [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($TargetRoot))
        Move-Item -LiteralPath $inner.FullName -Destination $TargetRoot
        return $true
    } catch {
        return $false
    } finally {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ---- command line -----------------------------------------------------------

function Get-QualityFormat([string]$Quality) {
    switch ($Quality) {
        '1080' { return 'bv*[height<=1080]+ba/b[height<=1080]' }
        '720' { return 'bv*[height<=720]+ba/b[height<=720]' }
        '480' { return 'bv*[height<=480]+ba/b[height<=480]' }
        default { return 'bv*+ba/b' }
    }
}

# The argument list yt-dlp is started with. Kept a function of its own so a self
# test can print exactly what a download would run.
function Get-YtDlpArguments($Job) {
    $arguments = New-Object System.Collections.ArrayList
    foreach ($prefix in @($Job.Prefix)) { if ($null -ne $prefix) { [void]$arguments.Add($prefix) } }
    $common = @(
        '--no-warnings',
        '--newline',
        '--no-playlist',
        '--windows-filenames',
        '--trim-filenames', '100',
        '--merge-output-format', 'mp4',
        '--format-sort', 'vcodec:h264',
        # A second run over the same range would otherwise see the file from the
        # first one and skip the transfer, leaving a result that cannot change.
        '--force-overwrites',
        '-P', $Job.Dir,
        '-o', $Job.Template,
        '--print-to-file', 'after_move:%(filepath)s', $Job.ResultFile,
        '-f', (Get-QualityFormat $Job.Quality)
    )
    foreach ($item in $common) { [void]$arguments.Add($item) }
    # No section at all is the whole video: yt-dlp is then left to take every
    # stream the format selection offers instead of one window of it.
    if ($Job.Start -ge 0 -and $Job.End -gt $Job.Start) {
        [void]$arguments.Add('--download-sections')
        [void]$arguments.Add(("*{0}-{1}" -f (Format-ClockLong $Job.Start), (Format-ClockLong $Job.End)))
    }
    if ($Job.Precise -and $Job.Start -ge 0 -and $Job.End -gt $Job.Start) { [void]$arguments.Add('--force-keyframes-at-cuts') }
    if (-not [string]::IsNullOrWhiteSpace($Job.FfmpegDir)) {
        [void]$arguments.Add('--ffmpeg-location')
        [void]$arguments.Add($Job.FfmpegDir)
    }
    if (-not [string]::IsNullOrWhiteSpace($Job.Cookies)) {
        [void]$arguments.Add('--cookies-from-browser')
        [void]$arguments.Add($Job.Cookies)
    }
    # The scanned sign-in travels as the cookie file yt-dlp reads, which needs no
    # browser and therefore no lock.
    if (-not [string]::IsNullOrWhiteSpace($Job.CookieFile)) {
        [void]$arguments.Add('--cookies')
        [void]$arguments.Add($Job.CookieFile)
    }
    [void]$arguments.Add($Job.Url)
    return $arguments
}

# ---- window -----------------------------------------------------------------

if ($SelfTest) {
    Read-Labels $LabelsFile
    $start = ConvertTo-Seconds '00:12:30'
    $end = ConvertTo-Seconds '00:18:30'
    $url = Resolve-VideoUrl 'BV1JE421w7jS'
    $report = [ordered]@{
        start = $start
        end = $end
        clockStart = Format-Clock $start
        clockEnd = Format-Clock $end
        url = $url
        shortUrl = (Resolve-VideoUrl 'b23.tv/abcd')
        fullUrl = (Resolve-VideoUrl 'https://www.bilibili.com/video/BV1JE421w7jS?p=2')
        badUrl = (Resolve-VideoUrl 'hello world')
        short = (ConvertTo-Seconds '12:30')
        hours = (ConvertTo-Seconds '1:02:03')
        seconds = (ConvertTo-Seconds '750')
        badTime = (ConvertTo-Seconds 'abc')
        # Both shapes a download can take: one range the switch turned on, and the
        # whole video with no section at all.
        sectionArgs = (Get-YtDlpArguments ([pscustomobject]@{
            Prefix = @('-m', 'yt_dlp'); Url = $url; Dir = 'D:\AI\AI-Anim\Video'
            Template = '%(title).80s [%(id)s] %(height)sp_0012-0030.%(ext)s'; Start = $start; End = $end
            ResultFile = 'C:\temp\r.txt'; Quality = '1080'; Precise = $true
            FfmpegDir = 'C:\ffmpeg\bin'; Cookies = 'edge'; CookieFile = 'C:\temp\cookies.txt'
        }))
        wholeArgs = (Get-YtDlpArguments ([pscustomobject]@{
            Prefix = @('-m', 'yt_dlp'); Url = $url; Dir = 'D:\AI\AI-Anim\Video'
            Template = '%(title).80s [%(id)s] %(height)sp.%(ext)s'; Start = -1; End = -1
            ResultFile = 'C:\temp\r.txt'; Quality = 'auto'; Precise = $false
            FfmpegDir = 'C:\ffmpeg\bin'; Cookies = ''; CookieFile = ''
        }))
        ffmpeg = (Find-FfmpegDir '')
        labels = (T 'VideoClipTitle')
    }
    [pscustomobject]$report | ConvertTo-Json -Depth 4
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

Read-Labels $LabelsFile

$SCRIPT:StateDir = Join-Path (Get-DshHome) 'little-icon'
$SCRIPT:MemoryFile = Join-Path $SCRIPT:StateDir 'video-clip.json'
$SCRIPT:FfmpegDir = Find-FfmpegDir $FfmpegHome
$SCRIPT:Process = $null
$SCRIPT:OutLog = ''
$SCRIPT:ErrLog = ''
$SCRIPT:ResultFile = ''
$SCRIPT:ReadAt = 0
$SCRIPT:Running = $false
$SCRIPT:FinalPath = ''
# The job the running child was started for, and when: a login state that cannot
# be read is dropped and the same job run once more without it, and only a file
# this run wrote may be reported as the result.
$SCRIPT:Job = $null
$SCRIPT:Retried = $false
$SCRIPT:StartedAt = [DateTime]::MinValue
# The Bilibili sign-in this machine made by scanning a code, kept as a Netscape
# cookie file beside the pet's state. It is a credential, so it stays on this
# machine and never in the repository; the account name is only what the window
# shows after checking the file against Bilibili.
$SCRIPT:CookieFile = Join-Path (Get-DshHome) 'little-icon\bilibili-cookies.txt'
$SCRIPT:BiliUser = ''
$SCRIPT:ScanForm = $null
$SCRIPT:ScanTimer = $null
$SCRIPT:QrKey = ''

# ---- the Bilibili sign-in ---------------------------------------------------
# A scanned code is the only sign-in this window can do by itself: the browser
# routes fail on Windows because Edge and Chrome lock their cookie database. The
# code comes from Bilibili's own passport API, the account's cookies are written
# as the Netscape file yt-dlp reads, and the file stays on this machine.

function New-QrImage([string]$Text, [string]$Path) {
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Text))
    $code = "import base64, segno`nsegno.make(base64.b64decode('$encoded').decode('utf-8'), error='m').save(r'$Path', scale=6, border=2)"
    & python -c $code 2>&1 | Out-Null
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return $true }
    # First use on this machine: the generator is small and pure Python, so it is
    # fetched once rather than reported as missing.
    & python -m pip install --quiet segno 2>&1 | Out-Null
    & python -c $code 2>&1 | Out-Null
    return (Test-Path -LiteralPath $Path -PathType Leaf)
}

# Bilibili's answer to the SESSDATA in the cookie file: the account name is what
# makes a file that went stale visible, instead of a download that quietly stays
# anonymous.
function Get-BiliUser([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
    $sess = ''
    try {
        $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    } catch {
        return ''
    }
    foreach ($line in ($content -split "`r?`n")) {
        if ($line -match "^[^\t]+\t[^\t]+\t[^\t]+\t[^\t]+\t[^\t]+\tSESSDATA\t(.+)$") { $sess = $matches[1] }
    }
    if ($sess -eq '') { return '' }
    # The cookie travels in a CookieContainer rather than a Cookie header: Windows
    # PowerShell's own request drops a hand-set header, which reads back as "not
    # signed in" on a session that is perfectly valid.
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
            $session.Cookies.Add((New-Object System.Net.Cookie('SESSDATA', $sess, '/', '.bilibili.com')))
            $response = Invoke-WebRequest -Uri 'https://api.bilibili.com/x/web-interface/nav' -UseBasicParsing -WebSession $session `
                -TimeoutSec 10 -Headers @{ Referer = 'https://www.bilibili.com' }
            $json = $response.Content | ConvertFrom-Json
            if ($json.code -eq 0 -and [bool]$json.data.isLogin) { return [string]$json.data.uname }
        } catch { }
        Start-Sleep -Milliseconds 400
    }
    return ''
}

function Save-BiliCookieFile($Cookies) {
    $fallback = [DateTimeOffset]::UtcNow.AddDays(180).ToUnixTimeSeconds()
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add('# Netscape HTTP Cookie File')
    [void]$lines.Add('# Scanned into the DSH pet on ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '. This file is a credential.')
    foreach ($cookie in $Cookies) {
        $domain = if ([string]::IsNullOrWhiteSpace($cookie.Domain)) { '.bilibili.com' } else { $cookie.Domain }
        $include = if ($domain.StartsWith('.')) { 'TRUE' } else { 'FALSE' }
        $path = if ([string]::IsNullOrWhiteSpace($cookie.Path)) { '/' } else { $cookie.Path }
        $secure = if ($cookie.Secure) { 'TRUE' } else { 'FALSE' }
        $expires = $fallback
        if ($cookie.Expires -ne [DateTime]::MinValue) {
            $expires = [DateTimeOffset]::new($cookie.Expires).ToUnixTimeSeconds()
        }
        [void]$lines.Add(($domain + "`t" + $include + "`t" + $path + "`t" + $secure + "`t" + $expires + "`t" + $cookie.Name + "`t" + $cookie.Value))
    }
    try {
        [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($SCRIPT:CookieFile))
        [System.IO.File]::WriteAllLines($SCRIPT:CookieFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
        return $true
    } catch {
        return $false
    }
}

# The row's second entry names the account, so the sign-in is visible without
# opening anything; the choice the person made is left where it was.
function Update-LoginChoice {
    $was = $cbLogin.SelectedIndex
    $text = if ([string]::IsNullOrWhiteSpace($SCRIPT:BiliUser)) { T 'VideoClipLoginPending' } else { (T 'VideoClipLoginUser') -f $SCRIPT:BiliUser }
    $cbLogin.Items[1] = $text
    $cbLogin.SelectedIndex = $was
}

# The scan window: Bilibili's code, drawn by segno, polled until the phone
# confirms it. The tick reads only script-scope names, because a handler invoked
# from the message loop does not see this function's locals.
function Start-BiliLogin {
    if ($null -ne $SCRIPT:ScanForm) {
        try { $SCRIPT:ScanForm.Close() } catch { }
        $SCRIPT:ScanForm = $null
    }
    $generated = $null
    try {
        $generated = Invoke-RestMethod -Uri 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate' `
            -Headers @{ Referer = 'https://www.bilibili.com' } -TimeoutSec 15
    } catch {
        Set-Status ((T 'VideoClipScanFailed') -f $_.Exception.Message)
        return
    }
    if ($null -eq $generated -or [int]$generated.code -ne 0 -or $null -eq $generated.data) {
        Set-Status ((T 'VideoClipScanFailed') -f [string]$generated.message)
        return
    }
    $SCRIPT:QrKey = [string]$generated.data.qrcode_key
    $SCRIPT:ScanPng = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-bili-qr-' + [guid]::NewGuid().ToString('N') + '.png')
    if (-not (New-QrImage ([string]$generated.data.url) $SCRIPT:ScanPng)) {
        Set-Status (T 'VideoClipScanNeedsPy')
        return
    }

    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text = T 'VideoClipScanTitle'
    $dialog.Size = New-Object System.Drawing.Size(340, 470)
    $dialog.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterParent
    $dialog.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $dialog.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
    try { $dialog.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10) } catch { }

    $picture = New-Object System.Windows.Forms.PictureBox
    $picture.Location = New-Object System.Drawing.Point(24, 16)
    $picture.Size = New-Object System.Drawing.Size(276, 276)
    $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    try { $picture.Image = [System.Drawing.Image]::FromFile($SCRIPT:ScanPng) } catch { }
    [void]$dialog.Controls.Add($picture)

    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = T 'VideoClipScanHint'
    $hint.Location = New-Object System.Drawing.Point(20, 302)
    $hint.Size = New-Object System.Drawing.Size(292, 60)
    $hint.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    [void]$dialog.Controls.Add($hint)

    $SCRIPT:ScanStatus = New-Object System.Windows.Forms.Label
    $SCRIPT:ScanStatus.Text = T 'VideoClipScanWaiting'
    $SCRIPT:ScanStatus.Location = New-Object System.Drawing.Point(20, 368)
    $SCRIPT:ScanStatus.Size = New-Object System.Drawing.Size(292, 44)
    $SCRIPT:ScanStatus.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $SCRIPT:ScanStatus.ForeColor = [System.Drawing.Color]::FromArgb(90, 98, 110)
    [void]$dialog.Controls.Add($SCRIPT:ScanStatus)

    $SCRIPT:ScanForm = $dialog
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 2000
    $SCRIPT:ScanTimer = $timer
    $timer.add_Tick({
        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $json = $null
        try {
            $poll = Invoke-WebRequest -Uri ("https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key={0}&source=main-fe-header" -f $SCRIPT:QrKey) `
                -UseBasicParsing -WebSession $session -TimeoutSec 15 -Headers @{ Referer = 'https://www.bilibili.com' }
            $json = $poll.Content | ConvertFrom-Json
        } catch {
            $SCRIPT:ScanStatus.Text = (T 'VideoClipScanFailed') -f $_.Exception.Message
            $SCRIPT:ScanTimer.Stop()
            return
        }
        if ($null -eq $json -or $null -eq $json.data) { return }
        $state = [int]$json.data.code
        if ($state -eq 0) {
            $SCRIPT:ScanTimer.Stop()
            $cookies = $session.Cookies.GetCookies([Uri]'https://www.bilibili.com')
            if (-not (Save-BiliCookieFile $cookies)) {
                $SCRIPT:ScanStatus.Text = (T 'VideoClipScanFailed') -f $SCRIPT:CookieFile
                return
            }
            $SCRIPT:BiliUser = Get-BiliUser $SCRIPT:CookieFile
            Update-LoginChoice
            if ($cbLogin.SelectedIndex -eq 0) { $cbLogin.SelectedIndex = 1 }
            $SCRIPT:ScanStatus.Text = (T 'VideoClipScanOk') -f $SCRIPT:BiliUser
            Add-Log ((T 'VideoClipCookieFile') -f $SCRIPT:CookieFile)
            Set-Status ((T 'VideoClipScanOk') -f $SCRIPT:BiliUser)
            try { $SCRIPT:ScanForm.Close() } catch { }
            return
        }
        if ($state -eq 86038) {
            $SCRIPT:ScanTimer.Stop()
            $SCRIPT:ScanStatus.Text = T 'VideoClipScanExpired'
            return
        }
        if ($state -eq 86090) {
            $SCRIPT:ScanStatus.Text = T 'VideoClipScanScanned'
        }
    })

    $dialog.add_FormClosed({
        try { $SCRIPT:ScanTimer.Stop() } catch { }
        $SCRIPT:ScanForm = $null
        try { if ($null -ne $picture.Image) { $picture.Image.Dispose() } } catch { }
        try { Remove-Item -LiteralPath $SCRIPT:ScanPng -Force -ErrorAction SilentlyContinue } catch { }
    })

    $timer.Start()
    [void]$dialog.ShowDialog($form)
}

# The folder the last run used, so reopening the window keeps it. Blank is the
# settings card's value, and a folder that has since gone is simply not used.
function Get-Memory {
    if (Test-Path -LiteralPath $SCRIPT:MemoryFile -PathType Leaf) {
        try {
            $text = [System.IO.File]::ReadAllText($SCRIPT:MemoryFile, [System.Text.Encoding]::UTF8)
            return ($text | ConvertFrom-Json)
        } catch {
            return $null
        }
    }
    return $null
}

function Save-Memory([string]$Dir) {
    try {
        $payload = [ordered]@{ dir = $Dir; at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
        $json = [pscustomobject]$payload | ConvertTo-Json -Depth 2
        [void][System.IO.Directory]::CreateDirectory($SCRIPT:StateDir)
        [System.IO.File]::WriteAllText($SCRIPT:MemoryFile, $json, (New-Object System.Text.UTF8Encoding($false)))
    } catch {
        # Remembering the folder is convenience only; a failed write is not a failure.
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = T 'VideoClipTitle'
$form.Size = New-Object System.Drawing.Size(660, 660)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::Sizable
$form.MinimumSize = New-Object System.Drawing.Size(620, 600)
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Font
$form.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 253)
$form.ForeColor = [System.Drawing.Color]::FromArgb(53, 59, 70)
try {
    $form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Regular,
        [System.Drawing.GraphicsUnit]::Point)
} catch { }

$accent = [System.Drawing.Color]::FromArgb(64, 120, 255)
$muted = [System.Drawing.Color]::FromArgb(120, 128, 140)

function New-Label([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, $Font = $null, $Color = $null) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point($X, $Y)
    $label.Size = New-Object System.Drawing.Size($W, $H)
    $label.AutoSize = $false
    if ($null -ne $Font) { $label.Font = $Font }
    if ($null -ne $Color) { $label.ForeColor = $Color }
    return $label
}

function New-TextBox([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H) {
    $box = New-Object System.Windows.Forms.TextBox
    $box.Text = $Text
    $box.Location = New-Object System.Drawing.Point($X, $Y)
    $box.Size = New-Object System.Drawing.Size($W, $H)
    $box.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    return $box
}

function New-Button([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [bool]$Primary) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $Text
    $button.Location = New-Object System.Drawing.Point($X, $Y)
    $button.Size = New-Object System.Drawing.Size($W, $H)
    $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $button.FlatAppearance.BorderSize = 1
    if ($Primary) {
        $button.BackColor = $accent
        $button.ForeColor = [System.Drawing.Color]::White
        $button.FlatAppearance.BorderColor = $accent
    } else {
        $button.BackColor = [System.Drawing.Color]::White
        $button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(210, 214, 222)
    }
    return $button
}

$intro = New-Label (T 'VideoClipIntro') 18 14 615 20 $null $muted

$lblUrl = New-Label (T 'VideoClipUrl') 18 44 90 20
$tbUrl = New-TextBox '' 18 66 615 26

$lblUrlHint = New-Label (T 'VideoClipUrlHint') 18 94 615 18 $null $muted
try { $lblUrlHint.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 8.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point) } catch { }

$chkRange = New-Object System.Windows.Forms.CheckBox
$chkRange.Text = T 'VideoClipRange'
$chkRange.Location = New-Object System.Drawing.Point(18, 122)
$chkRange.Size = New-Object System.Drawing.Size(150, 24)
$chkRange.FlatStyle = [System.Windows.Forms.FlatStyle]::System
$chkRange.Checked = $false

$lblStart = New-Label (T 'VideoClipStart') 180 122 50 20
$tbStart = New-TextBox '00:00:00' 180 144 120 26
$tbStart.Enabled = $false
$lblEnd = New-Label (T 'VideoClipEnd') 312 122 50 20
$tbEnd = New-TextBox '00:05:00' 312 144 120 26
$tbEnd.Enabled = $false

$lblTimeHint = New-Label (T 'VideoClipTimeHint') 436 148 194 20 $null $muted

$lblDir = New-Label (T 'VideoClipDir') 18 180 90 20
$tbDir = New-TextBox $DefaultDir 18 202 470 26
$btnBrowse = New-Button (T 'VideoClipBrowse') 496 200 66 30 $false
$btnOpenDir = New-Button (T 'VideoClipOpen') 567 200 66 30 $false

$lblQuality = New-Label (T 'VideoClipQuality') 18 240 90 20
$cbQuality = New-Object System.Windows.Forms.ComboBox
$cbQuality.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
$cbQuality.Location = New-Object System.Drawing.Point(18, 262)
$cbQuality.Size = New-Object System.Drawing.Size(150, 26)
[void]$cbQuality.Items.Add((T 'VideoClipQualityAuto'))
[void]$cbQuality.Items.Add((T 'VideoClipQuality1080'))
[void]$cbQuality.Items.Add((T 'VideoClipQuality720'))
[void]$cbQuality.Items.Add((T 'VideoClipQuality480'))
$cbQuality.SelectedIndex = 0

$lblLogin = New-Label (T 'VideoClipLogin') 184 240 90 20
$cbLogin = New-Object System.Windows.Forms.ComboBox
$cbLogin.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
$cbLogin.Location = New-Object System.Drawing.Point(184, 262)
$cbLogin.Size = New-Object System.Drawing.Size(150, 26)
# The second entry is the account this machine scanned in: its text is rewritten
# once the sign-in lands (see Update-LoginChoice), and the browser routes follow
# because those databases are locked while the browser runs.
[void]$cbLogin.Items.Add((T 'VideoClipLoginNone'))
[void]$cbLogin.Items.Add((T 'VideoClipLoginPending'))
[void]$cbLogin.Items.Add('Edge')
[void]$cbLogin.Items.Add('Chrome')
[void]$cbLogin.Items.Add('Firefox')
$cbLogin.SelectedIndex = 0
$btnScan = New-Button (T 'VideoClipScan') 342 260 90 30 $false

$chkPrecise = New-Object System.Windows.Forms.CheckBox
$chkPrecise.Text = T 'VideoClipPrecise'
$chkPrecise.Location = New-Object System.Drawing.Point(18, 300)
$chkPrecise.Size = New-Object System.Drawing.Size(320, 24)
$chkPrecise.FlatStyle = [System.Windows.Forms.FlatStyle]::System
# A copied section starts at the keyframe before the requested second and keeps
# that earlier stretch at negative timestamps, which players and editors show as
# a longer, broken clip. Cutting exactly is the only correct default.
$chkPrecise.Checked = $true

$btnDownload = New-Button (T 'VideoClipDownload') 18 334 120 34 $true
$btnCancel = New-Button (T 'VideoClipCancel') 146 334 90 34 $false
$btnCancel.Enabled = $false
$btnClose = New-Button (T 'VideoClipClose') 543 334 90 34 $false

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(18, 378)
$bar.Size = New-Object System.Drawing.Size(615, 12)
$bar.Minimum = 0
$bar.Maximum = 1000
$bar.Value = 0

$lblStatus = New-Label (T 'VideoClipReady') 18 396 615 20

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$logBox.Location = New-Object System.Drawing.Point(18, 422)
$logBox.Anchor = ([System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right)
$logBox.Size = New-Object System.Drawing.Size(615, 178)
$logBox.BackColor = [System.Drawing.Color]::White
$logBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
try {
    $logBox.Font = New-Object System.Drawing.Font('Consolas', 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
} catch { }

# The boxes follow the window through Anchor rather than through one arithmetic
# pass: WinForms already scales a control's bounds for the display's DPI, so a
# width computed from ClientSize here would be scaled a second time and run past
# the edge. The log keeps all four of its edges, the buttons keep the right one,
# and the rows that span the window stretch between both margins.
$stretch = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
$keepRight = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$fill = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
foreach ($control in @($intro, $tbUrl, $lblUrlHint, $tbDir, $lblTimeHint, $chkPrecise, $bar, $lblStatus)) {
    $control.Anchor = $stretch
}
foreach ($control in @($btnBrowse, $btnOpenDir, $btnClose)) { $control.Anchor = $keepRight }
$logBox.Anchor = $fill

function Add-Log([string]$Line) {
    if ([string]::IsNullOrWhiteSpace($Line)) { return }
    $text = $logBox.Text
    if ($text.Length -gt 60000) { $text = $text.Substring($text.Length - 40000) }
    $logBox.Text = $text + $Line + "`r`n"
    $logBox.SelectionStart = $logBox.Text.Length
    $logBox.ScrollToCaret()
}

function Set-Status([string]$Text) {
    $lblStatus.Text = $Text
}

# The download is a child process with its output in two files; the timer reads
# what arrived since the last tick, which keeps every UI update on this thread.
# The files are opened for shared access: the child holds them open while it
# writes, and a plain read would be refused for as long as it runs.
function Read-SharedText([string]$Path) {
    try {
        $stream = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    } catch {
        return $null
    }
    try {
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        return $reader.ReadToEnd()
    } finally {
        $stream.Dispose()
    }
}

# A section cut made with stream copy can begin at the keyframe before the asked
# start and keep the frames in between at negative packet timestamps: players
# then show a clip that is longer than asked for or starts on an undecodable
# frame. When the first packet is negative the file is re-encoded from its own
# zero point for exactly the requested length, which needs no second download.
function Repair-ClipTimeline([string]$Path, $Job) {
    if ($null -eq $Job -or $null -eq $Job.Start -or $Job.Start -lt 0) { return $Path }
    $seconds = [double]$Job.End - [double]$Job.Start
    if ($seconds -le 0) { return $Path }
    $ffprobe = Join-Path $Job.FfmpegDir 'ffprobe.exe'
    $ffmpeg = Join-Path $Job.FfmpegDir 'ffmpeg.exe'
    if (-not (Test-Path -LiteralPath $ffprobe -PathType Leaf)) { return $Path }
    if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) { return $Path }
    $packets = & $ffprobe -v error -select_streams v:0 -show_entries packet=pts_time -of csv=p=0 $Path 2>$null
    $first = [double]::MaxValue
    foreach ($line in @($packets)) {
        $value = 0.0
        if ([double]::TryParse(([string]$line).Trim(), [ref]$value)) {
            if ($value -lt $first) { $first = $value }
        }
    }
    if ($first -eq [double]::MaxValue -or $first -ge -0.05) { return $Path }
    Set-Status ((T 'VideoClipRepairing') -f $seconds)
    Add-Log ((T 'VideoClipRepairing') -f $seconds)
    $form.Refresh()
    $temp = Join-Path ([System.IO.Path]::GetDirectoryName($Path)) ([System.IO.Path]::GetFileNameWithoutExtension($Path) + '.fixed.mp4')
    & $ffmpeg -v error -y -i $Path -ss 0 -t $seconds -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k -movflags +faststart $temp 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temp -PathType Leaf)) {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
        return $Path
    }
    try {
        Move-Item -LiteralPath $temp -Destination $Path -Force
    } catch {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        return $Path
    }
    return $Path
}

# One run of yt-dlp: its own temporary directory for the two output files, then
# the child itself. Called once from the button and once more when a browser's
# login state turned out to be unreadable, which is why it takes the job rather
# than reading the boxes again.
function Start-ClipJob($Job) {
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-clip-' + [guid]::NewGuid().ToString('N'))
    [void][System.IO.Directory]::CreateDirectory($work)
    $SCRIPT:OutLog = Join-Path $work 'out.log'
    $SCRIPT:ErrLog = Join-Path $work 'err.log'
    $SCRIPT:ResultFile = Join-Path $work 'result.txt'
    $Job.ResultFile = $SCRIPT:ResultFile
    $SCRIPT:ReadAt = 0
    $SCRIPT:FinalPath = ''
    $SCRIPT:Job = $Job
    $SCRIPT:StartedAt = [DateTime]::Now
    $arguments = Get-YtDlpArguments $Job
    $argString = (@($arguments) | ForEach-Object { Quote-Arg ([string]$_) }) -join ' '
    Add-Log ('> ' + $Job.File + ' ' + $argString)
    Set-Status (T 'VideoClipPreparing')
    $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
    $bar.Value = 0
    try {
        # Python buffers its output when stdout is a file rather than a console,
        # which would hold the progress lines back until the download ends.
        $env:PYTHONUNBUFFERED = '1'
        $SCRIPT:Process = Start-Process -FilePath $Job.File -ArgumentList $argString -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $SCRIPT:OutLog -RedirectStandardError $SCRIPT:ErrLog -WorkingDirectory $Job.Dir
    } catch {
        Add-Log $_.Exception.Message
        Set-Status (T 'VideoClipFailed')
        $SCRIPT:Process = $null
        $SCRIPT:Running = $false
        $btnDownload.Enabled = $true
        $btnCancel.Enabled = $false
        return
    }
    $SCRIPT:Running = $true
    $btnDownload.Enabled = $false
    $btnCancel.Enabled = $true
    $timer.Start()
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400
$timer.add_Tick({
    if ($null -eq $SCRIPT:Process) { return }
    try {
        if (Test-Path -LiteralPath $SCRIPT:OutLog) {
            $all = Read-SharedText $SCRIPT:OutLog
            if ($null -ne $all -and $all.Length -gt $SCRIPT:ReadAt) {
                $chunk = $all.Substring($SCRIPT:ReadAt)
                $SCRIPT:ReadAt = $all.Length
                foreach ($line in ($chunk -split "`r?`n")) {
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    Add-Log $line
                    if ($line -match '(\d{1,3}(\.\d)?)%') {
                        $percent = [double]$matches[1]
                        if ($percent -ge 0 -and $percent -le 100) {
                            $bar.Value = [int]($percent * 10)
                            Set-Status ((T 'VideoClipDownloading') -f ($line -replace '^\[download\]\s*', ''))
                        }
                    }
                }
            }
        }
        if ($SCRIPT:Process.HasExited) {
            $timer.Stop()
            $code = $SCRIPT:Process.ExitCode
            $SCRIPT:Process = $null
            $SCRIPT:Running = $false
            $btnDownload.Enabled = $true
            $btnCancel.Enabled = $false
            $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
            Add-Log ((T 'VideoClipExitCode') -f $code)
            $errors = ''
            if (Test-Path -LiteralPath $SCRIPT:ErrLog) {
                $errors = Read-SharedText $SCRIPT:ErrLog
                if ($null -eq $errors) { $errors = '' }
                if ($errors.Trim() -ne '') { Add-Log $errors.Trim() }
            }
            $output = Read-SharedText $SCRIPT:OutLog
            if ($null -eq $output) { $output = '' }
            # The file is what decides, not the exit code: yt-dlp can end a finished
            # download with a stray warning and a non-zero status, and a range that
            # was already saved makes it skip the transfer altogether and name the
            # file it kept.
            $final = ''
            if (Test-Path -LiteralPath $SCRIPT:ResultFile) {
                $final = Read-SharedText $SCRIPT:ResultFile
                if ($null -eq $final) { $final = '' } else { $final = $final.Trim() }
            }
            if ($final -eq '' -or -not (Test-Path -LiteralPath $final)) {
                if ($output -match '(?m)^\[download\]\s+(.+?)\s+has already been downloaded') {
                    $final = $matches[1].Trim()
                }
            }
            if ($final -eq '' -or -not (Test-Path -LiteralPath $final)) {
                # Still within this run: only a file this download wrote may be the
                # clip that was asked for, never one the folder already held.
                $newest = Get-ChildItem -LiteralPath $tbDir.Text -File -ErrorAction SilentlyContinue |
                    Where-Object { $_.Extension -in @('.mp4', '.mkv', '.flv', '.webm', '.m4a') -and $_.LastWriteTime -ge $SCRIPT:StartedAt.AddSeconds(-2) } |
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($null -ne $newest) { $final = $newest.FullName }
            }
            if ($final -ne '' -and (Test-Path -LiteralPath $final) -and $null -ne $SCRIPT:Job -and -not $SCRIPT:Job.Precise) {
                $final = Repair-ClipTimeline $final $SCRIPT:Job
            }
            $SCRIPT:FinalPath = $final
            if ($final -ne '' -and (Test-Path -LiteralPath $final)) {
                $size = ''
                try {
                    $info = Get-Item -LiteralPath $final
                    $size = '{0:N1} MB' -f ($info.Length / 1MB)
                } catch { }
                $bar.Value = 1000
                # The line names the file rather than the whole path: the folder is
                # already in its own box, and a full path is cut off on this row.
                Set-Status ((T 'VideoClipDoneSize') -f $size, [System.IO.Path]::GetFileName($final))
                Add-Log ((T 'VideoClipDone') -f $final)
                Save-Memory $tbDir.Text
                return
            }
            # Nothing was written: a browser whose cookie database cannot be read
            # fails the run before any transfer, and that is worth one retry without
            # it, in the formats Bilibili serves to a visitor.
            if (-not $SCRIPT:Retried -and $null -ne $SCRIPT:Job -and
                -not [string]::IsNullOrWhiteSpace([string]$SCRIPT:Job.Cookies) -and
                ($errors + ' ' + $output) -match '(?i)cookie') {
                $SCRIPT:Retried = $true
                Add-Log (T 'VideoClipCookieRetry')
                Add-Log (T 'VideoClipCookieTip')
                $SCRIPT:Job.Cookies = ''
                Start-ClipJob $SCRIPT:Job
                return
            }
            Set-Status (T 'VideoClipFailed')
        }
    } catch {
        Add-Log $_.Exception.Message
    }
})

# ---- actions ----------------------------------------------------------------

function Open-Folder([string]$Dir) {
    if ([string]::IsNullOrWhiteSpace($Dir)) { return }
    try {
        if (Test-Path -LiteralPath $Dir) {
            Start-Process -FilePath 'explorer.exe' -ArgumentList (Quote-Arg $Dir)
        } else {
            Set-Status (T 'VideoClipOpenFailed')
        }
    } catch {
        Set-Status (T 'VideoClipOpenFailed')
    }
}

$btnBrowse.add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = T 'VideoClipDir'
    $dialog.ShowNewFolderButton = $true
    if (Test-Path -LiteralPath $tbDir.Text) { $dialog.SelectedPath = $tbDir.Text }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $tbDir.Text = $dialog.SelectedPath }
})

$btnOpenDir.add_Click({ Open-Folder $tbDir.Text })

# The two time boxes are grey until the section switch is on: the default is the
# whole video, and a time that is not asked for is not a time to fill in.
function Update-RangeState {
    $on = [bool]$chkRange.Checked
    $tbStart.Enabled = $on
    $tbEnd.Enabled = $on
    $lblStart.ForeColor = if ($on) { $form.ForeColor } else { [System.Drawing.Color]::FromArgb(160, 166, 176) }
    $lblEnd.ForeColor = $lblStart.ForeColor
}

$chkRange.add_CheckedChanged({ Update-RangeState })

$btnScan.add_Click({
    try { Start-BiliLogin } catch {
        Add-Log $_.Exception.Message
        Set-Status ((T 'VideoClipScanFailed') -f $_.Exception.Message)
    }
})

$btnClose.add_Click({
    if ($SCRIPT:Running) {
        # Closing while a download runs would leave the child behind a window that
        # is gone, so the window asks it to stop first.
        if ($null -ne $SCRIPT:Process) { try { $SCRIPT:Process.Kill() } catch { } }
    }
    $form.Close()
})

$btnCancel.add_Click({
    if ($null -ne $SCRIPT:Process) {
        try {
            $SCRIPT:Process.Kill()
            Add-Log (T 'VideoClipCancelled')
            Set-Status (T 'VideoClipCancelled')
        } catch { }
    }
})

$btnDownload.add_Click({
    if ($SCRIPT:Running) {
        Set-Status (T 'VideoClipRunning')
        return
    }
    $url = Resolve-VideoUrl $tbUrl.Text
    if ($url -eq '') { Set-Status (T 'VideoClipBadUrl'); return }
    # -1 in either bound means "no section": the whole video is what the download
    # takes, and the grey boxes are not read at all.
    $start = -1
    $end = -1
    if ([bool]$chkRange.Checked) {
        $start = ConvertTo-Seconds $tbStart.Text
        $end = ConvertTo-Seconds $tbEnd.Text
        if ($start -lt 0 -or $end -lt 0) { Set-Status (T 'VideoClipBadTime'); return }
        if ($end -le $start) { Set-Status (T 'VideoClipBadRange'); return }
    }
    $dir = $tbDir.Text.Trim()
    if ($dir -eq '') { Set-Status (T 'VideoClipBadDir'); return }

    $ytdlp = Find-YtDlp
    if ($null -eq $ytdlp) { Set-Status (T 'VideoClipNoYtdlp'); return }

    if ([string]::IsNullOrWhiteSpace($SCRIPT:FfmpegDir)) {
        $target = Join-Path (Get-DshHome) 'tools\ffmpeg'
        Set-Status (T 'VideoClipFfmpegWait')
        Add-Log (T 'VideoClipFfmpegWait')
        $form.Refresh()
        if (Install-Ffmpeg $target) {
            $SCRIPT:FfmpegDir = Find-FfmpegDir (Join-Path $target 'bin')
            if (-not [string]::IsNullOrWhiteSpace($SCRIPT:FfmpegDir)) {
                Add-Log ((T 'VideoClipFfmpegReady') + ' ' + (T 'VideoClipFfmpegDir') -f (Join-Path $target 'bin'))
            }
        }
        if ([string]::IsNullOrWhiteSpace($SCRIPT:FfmpegDir)) {
            Set-Status (T 'VideoClipFfmpegFailed')
            return
        }
    }

    try { [void][System.IO.Directory]::CreateDirectory($dir) } catch { }
    if (-not (Test-Path -LiteralPath $dir)) { Set-Status (T 'VideoClipBadDir'); return }

    $quality = switch ($cbQuality.SelectedIndex) {
        1 { '1080' }
        2 { '720' }
        3 { '480' }
        default { 'auto' }
    }
    $cookies = ''
    $cookieFile = ''
    if ($cbLogin.SelectedIndex -eq 1) {
        # The scanned account: without it the entry means nothing, so the download
        # says what to do instead of quietly going out anonymous.
        if ([string]::IsNullOrWhiteSpace($SCRIPT:BiliUser)) { Set-Status (T 'VideoClipLoginFirst'); return }
        $cookieFile = $SCRIPT:CookieFile
    } elseif ($cbLogin.SelectedIndex -gt 1) {
        $cookies = @('', '', 'edge', 'chrome', 'firefox')[$cbLogin.SelectedIndex]
    }

    $stamp = ''
    $template = '%(title).80s [%(id)s] %(height)sp.%(ext)s'
    if ($start -ge 0) {
        $stamp = '{0}-{1}' -f (Format-Clock $start).Replace(':', ''), (Format-Clock $end).Replace(':', '')
        $template = ('%(title).80s [%(id)s] %(height)sp_{0}.%(ext)s' -f $stamp)
    }
    $SCRIPT:Retried = $false
    $logBox.Text = ''
    Add-Log ((T 'VideoClipYtdlpDir') -f $ytdlp.Name)
    Add-Log ((T 'VideoClipFfmpegDir') -f $SCRIPT:FfmpegDir)
    Start-ClipJob ([pscustomobject]@{
        File       = $ytdlp.File
        Prefix     = @($ytdlp.Prefix)
        Url        = $url
        Dir        = $dir
        Template   = $template
        Start      = $start
        End        = $end
        ResultFile = ''
        Quality    = $quality
        Precise    = [bool]$chkPrecise.Checked
        FfmpegDir  = $SCRIPT:FfmpegDir
        Cookies    = $cookies
        CookieFile = $cookieFile
    })
})

$form.add_FormClosed({
    if ($null -ne $SCRIPT:Process) { try { $SCRIPT:Process.Kill() } catch { } }
})

$form.add_Shown({
    Update-RangeState
    $tbUrl.Focus() | Out-Null
    if ([string]::IsNullOrWhiteSpace($tbDir.Text)) { $tbDir.Text = $DefaultDir }
    if (-not [string]::IsNullOrWhiteSpace($SCRIPT:FfmpegDir)) {
        Add-Log ((T 'VideoClipFfmpegDir') -f $SCRIPT:FfmpegDir)
    }
    # A sign-in from an earlier session is checked against Bilibili before it is
    # offered: a cookie that went stale shows as "not signed in", not as a name.
    $SCRIPT:BiliUser = Get-BiliUser $SCRIPT:CookieFile
    Update-LoginChoice
    if (-not [string]::IsNullOrWhiteSpace($SCRIPT:BiliUser)) {
        Add-Log ((T 'VideoClipLoginUser') -f $SCRIPT:BiliUser)
        $cbLogin.SelectedIndex = 1
    }
    $ytdlp = Find-YtDlp
    if ($null -ne $ytdlp) { Add-Log ((T 'VideoClipYtdlpDir') -f $ytdlp.Name) } else { Set-Status (T 'VideoClipNoYtdlp') }
})

foreach ($control in @($intro, $lblUrl, $tbUrl, $lblUrlHint, $chkRange, $lblStart, $tbStart, $lblEnd, $tbEnd, $lblTimeHint,
        $lblDir, $tbDir, $btnBrowse, $btnOpenDir, $lblQuality, $cbQuality, $lblLogin, $cbLogin, $btnScan, $chkPrecise,
        $btnDownload, $btnCancel, $btnClose, $bar, $lblStatus, $logBox)) {
    [void]$form.Controls.Add($control)
}

# The remembered folder wins over the configured one: the last download is what
# the next one most often repeats, while a settings change arrives with a restart.
$memory = Get-Memory
if ($null -ne $memory -and -not [string]::IsNullOrWhiteSpace([string]$memory.dir)) {
    $tbDir.Text = [string]$memory.dir
} elseif (-not [string]::IsNullOrWhiteSpace($DefaultDir)) {
    $tbDir.Text = $DefaultDir
}

[void][System.Windows.Forms.Application]::Run($form)
