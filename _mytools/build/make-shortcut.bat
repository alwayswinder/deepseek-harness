@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Put DeepSeek Harness where an application belongs: a Start Menu entry (and a
rem desktop one) carrying the app icon, starting this working copy through the
rem hidden launcher instead of a console batch file.
rem
rem   make-shortcut.bat                   Start Menu + desktop
rem   make-shortcut.bat --start-menu-only Start Menu only
rem   make-shortcut.bat --remove          delete both again
rem
rem Rerunning it is how the shortcuts get refreshed; nothing is authoritative
rem here. The icon is rendered from apps\desktop\resources\icon-windows.svg into
rem the harness home, so it follows the app's own artwork.
rem ============================================================

for %%I in ("%~f0") do set "SCRIPT_PATH=%%~fI"
for %%I in ("%SCRIPT_PATH%") do set "SCRIPT_DIR=%%~dpI"

set "INSTALL_ARGS="
if /i "%~1"=="--start-menu-only" set "INSTALL_ARGS=-StartMenuOnly"
if /i "%~1"=="--remove" set "INSTALL_ARGS=-Remove"
if /i "%~1"=="--no-pause" set "DSH_NO_PAUSE=1"
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-shortcut.ps1" %INSTALL_ARGS%
set "SHORTCUT_EXIT=%errorlevel%"
if not "%SHORTCUT_EXIT%"=="0" echo [shortcut] Failed with exit code %SHORTCUT_EXIT%.
if not defined DSH_NO_PAUSE pause
exit /b %SHORTCUT_EXIT%

:usage
echo Usage: make-shortcut.bat [--start-menu-only ^| --remove]
if not defined DSH_NO_PAUSE pause
exit /b 0
