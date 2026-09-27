# Create (or remove) the Start Menu and desktop shortcuts that start the Desktop
# app from this working copy.
#
# The shortcut points at the hidden launcher rather than the batch file, so a
# launch shows no console window, and it carries the application icon - rendered
# from the repository's own vector source by make-app-icon.mjs, because the
# committed tray icon is drawn with an enlarged mark for 16 px and would read as
# too full at the sizes a shortcut uses.
#
# Nothing here is authoritative: rerunning it updates the shortcuts in place, and
# --remove deletes them. The icon lives under the harness home, not in the
# repository.

param(
    [switch]$StartMenuOnly,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'resolve-dsh-home.ps1')

$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$launcher = Join-Path $PSScriptRoot 'launch-desktop.vbs'
$icon = Join-Path (Resolve-DshHome) 'build\dsh.ico'
$fallbackIcon = Join-Path $repository 'apps\desktop\resources\tray-windows.ico'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$name = 'DeepSeek Harness'

$targets = @(Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$name.lnk")
if (-not $StartMenuOnly) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ($desktop -ne '') { $targets += Join-Path $desktop "$name.lnk" }
}

if ($Remove) {
    foreach ($target in $targets) {
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force
            Write-Host "[shortcut] removed $target"
        }
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $launcher)) { throw "hidden launcher is missing: $launcher" }

# Render the icon when it is absent; a missing Node is not fatal, the tray icon
# is a workable stand-in and the shortcut still gets an icon.
if (-not (Test-Path -LiteralPath $icon)) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $node) {
        & $node.Source (Join-Path $PSScriptRoot 'make-app-icon.mjs') | Write-Host
    } else {
        Write-Host '[shortcut] Node was not found; using the committed tray icon instead.'
    }
}
if (-not (Test-Path -LiteralPath $icon)) { $icon = $fallbackIcon }

$shell = New-Object -ComObject WScript.Shell
foreach ($target in $targets) {
    $directory = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    $link = $shell.CreateShortcut($target)
    $link.TargetPath = $wscript
    $link.Arguments = '"' + $launcher + '"'
    $link.WorkingDirectory = $repository
    $link.IconLocation = "$icon,0"
    $link.Description = "$name (this working copy)"
    $link.Save()
    Write-Host "[shortcut] $target"
}

Write-Host "[shortcut] icon: $icon"
Write-Host '[shortcut] Remove them again with: _mytools\build\make-shortcut.bat --remove'
