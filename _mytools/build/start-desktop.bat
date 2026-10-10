@echo off
setlocal
chcp 65001 >nul

rem Logitech G HUB starts this batch with stdout and stderr already closed, and
rem cmd.exe terminates on the first console write while both are unusable (measured:
rem it died on ensure-plugin-modules.bat's "[plugins] ..." line, before wscript ever
rem ran). One usable stream is enough, so re-run this script once with stderr on a
rem log file under %TEMP% and let that copy do the actual launch. stdout stays on
rem the console, which keeps the messages and the pauses working when the script is
rem started from Explorer or a terminal.
if "%~1"=="redirected" goto :streamsReady
set "DSH_ERR_LOG=%TEMP%\dsh-desktop-stderr.log"
copy /y nul "%DSH_ERR_LOG%" >nul 2>&1
if errorlevel 1 set "DSH_ERR_LOG=%TEMP%\dsh-desktop-stderr-%RANDOM%.log"
call "%~f0" redirected 2> "%DSH_ERR_LOG%"
set "DSH_LAUNCH_EXIT=%errorlevel%"
exit /b %DSH_LAUNCH_EXIT%

:streamsReady

rem Launch the prepared Electron app directly and detach it from this window.
rem This launcher checks only files required to start; deciding whether source
rem changes need a rebuild belongs to the user.
rem Resolve the repository root from this script's location (_mytools\build).
for %%I in ("%~dp0..\..") do set "DSH_REPO=%%~fI"

set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE="
rem Share the configured Harness home so Desktop sees the same Web sessions and
rem settings. Resolve blank, tilde, and relative values before changing cwd.
set "DSH_HOME_DIR="
for /f "tokens=*" %%A in ("%DSH_HOME%") do set "DSH_HOME_DIR=%%A"
if not defined DSH_HOME_DIR set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
if "%DSH_HOME_DIR:~0,1%"=="~" set "DSH_HOME_DIR=%USERPROFILE%%DSH_HOME_DIR:~1%"
for %%I in ("%DSH_HOME_DIR%") do set "DSH_HOME=%%~fI"
set "DSH_DESKTOP_HOST_INSPECT_PORT=9230"
set "DSH_DESKTOP_OPEN_DEVTOOLS=0"
set "ELECTRON_ENABLE_LOGGING=0"

set "DESKTOP_APP=%DSH_REPO%\apps\desktop"
set "DESKTOP_DEVELOPMENT=%DESKTOP_APP%\.desktop-build\development"
set "DESKTOP_PROJECT=%DESKTOP_DEVELOPMENT%\project"
set "DESKTOP_ELECTRON_SOURCE=%DESKTOP_APP%\node_modules\electron\dist"
set "DESKTOP_LOG=%DESKTOP_DEVELOPMENT%\desktop.log"
rem Electron's browser storage lives under the Harness home, not in the build
rem tree: a full build deletes that tree, and with it every sign-in the Sidebar
rem browser and the platform account view had stored.
set "DESKTOP_USER_DATA=%DSH_HOME%\desktop\electron-user-data"
set "DSH_DESKTOP_PRIMARY_RUNTIME_DIR=%DESKTOP_APP%\.desktop-build\targets\win-x64\runtime\primary-runtime"
set "MISSING_STARTUP_FILE="

rem The out-of-tree plugins the Desktop profile loads import
rem @deepseek-ai/schemastery from their own directory; link the vendored copy
rem so a plugin installed as a link into the profile can activate.
call "%~dp0ensure-plugin-modules.bat"
if errorlevel 1 goto :pluginFailure

rem The profile installs its JavaScript plugins as file: directory copies, which
rem pnpm writes once and never reconciles against the source; refresh them so a
rem pulled plugin change is what this launch loads.
call "%~dp0sync-plugins.bat" desktop
if errorlevel 1 goto :pluginFailure

rem Merge the checked-in portable settings into this machine before the app reads
rem them, so a pulled change is in effect on this launch: the pet's profile
rem section and the Desktop's shortcut document. A value edited on this machine
rem keeps until its file changes again. A missing node or a failed merge is
rem reported and never blocks the launch.
for %%I in ("%~dp0..\settings") do set "SETTINGS_SYNC_DIR=%%~fI"
where node >nul 2>&1
if errorlevel 1 (
    echo [desktop] WARNING: node was not found; skipping the settings sync.
) else (
    node "%SETTINGS_SYNC_DIR%\sync-settings.mjs" apply --profile desktop --quiet
)

rem Back up this machine's DSH and Codex conversation records once per launch. The
rem worker keeps one snapshot per day, so a second start the same day only
rem refreshes it; a missing node or a failed copy is reported and never blocks
rem the launch.
call "%~dp0..\backup\backup-chats.bat"

rem Carry over the browser data earlier launchers kept inside the build tree, so
rem this launch starts signed in instead of asking again.
call "%~dp0migrate-desktop-user-data.bat"

if not exist "%DESKTOP_ELECTRON_SOURCE%\electron.exe" goto :missingElectron
call "%~dp0prepare-desktop-electron.bat" "%DESKTOP_ELECTRON_SOURCE%"
if errorlevel 1 goto :electronCacheFailure
set "DESKTOP_EXE=%DSH_DESKTOP_ELECTRON_EXE%"
if not exist "%DSH_REPO%\apps\cli\lib\profile-boot.js" set "MISSING_STARTUP_FILE=%DSH_REPO%\apps\cli\lib\profile-boot.js"
if defined MISSING_STARTUP_FILE goto :missingBuild
if not exist "%DESKTOP_APP%\lib\main.js" set "MISSING_STARTUP_FILE=%DESKTOP_APP%\lib\main.js"
if defined MISSING_STARTUP_FILE goto :missingBuild
if not exist "%DSH_REPO%\apps\desktop-host\lib\index.js" set "MISSING_STARTUP_FILE=%DSH_REPO%\apps\desktop-host\lib\index.js"
if defined MISSING_STARTUP_FILE goto :missingBuild
if not exist "%DESKTOP_PROJECT%\desktop-runtime.json" set "MISSING_STARTUP_FILE=%DESKTOP_PROJECT%\desktop-runtime.json"
if defined MISSING_STARTUP_FILE goto :missingBuild
if not exist "%DSH_DESKTOP_PRIMARY_RUNTIME_DIR%\runtime.json" set "MISSING_STARTUP_FILE=%DSH_DESKTOP_PRIMARY_RUNTIME_DIR%\runtime.json"
if defined MISSING_STARTUP_FILE goto :missingBuild

if not exist "%DESKTOP_DEVELOPMENT%" mkdir "%DESKTOP_DEVELOPMENT%"
rem The launching cmd.exe holds the log file open for the whole life of the app it
rem started (start-dsh-service.vbs redirects the app output there), so while an
rem earlier Desktop instance is alive the redirection below cannot open this path
rem and cmd.exe exits without ever running electron.exe. Fall back to a per-launch
rem log then; Electron still starts, so a second press focuses the open window.
copy /y nul "%DESKTOP_LOG%" >nul 2>&1
if errorlevel 1 set "DESKTOP_LOG=%DESKTOP_DEVELOPMENT%\desktop-%RANDOM%.log"
forfiles /p "%DESKTOP_DEVELOPMENT%" /m "desktop-*.log" /d -1 /c "cmd /c del @path" >nul 2>&1
wscript.exe //nologo "%~dp0start-dsh-service.vbs" "%DESKTOP_LOG%" "%DESKTOP_APP%" "%DESKTOP_EXE%" "--user-data-dir=%DESKTOP_USER_DATA%" "%DESKTOP_APP%"
if errorlevel 1 goto :launchFailure
echo [desktop] Launch requested. Log: %DESKTOP_LOG%
exit /b 0

:missingElectron
echo [desktop] Electron is not installed at
echo [desktop]   %DESKTOP_ELECTRON_SOURCE%\electron.exe
echo [desktop] Run build-desktop.bat (it installs dependencies) and try again.
call :maybePause
exit /b 1

:electronCacheFailure
echo [desktop] Electron could not be prepared outside the checkout.
call :maybePause
exit /b 1

:missingBuild
echo [desktop] Required startup file is missing:
echo [desktop]   %MISSING_STARTUP_FILE%
echo [desktop] Run build-desktop.bat and try again.
call :maybePause
exit /b 1

:pluginFailure
echo [desktop] Out-of-tree plugin setup failed. Fix the [plugins] error above.
call :maybePause
exit /b 1

:launchFailure
echo [desktop] The hidden launcher failed to start Electron.
call :maybePause
exit /b 1

rem A hidden launcher (build\launch-desktop.vbs, behind the Start Menu shortcut)
rem cannot press a key, so it sets DSH_NO_PAUSE and reads the log instead.
:maybePause
if not defined DSH_NO_PAUSE pause
exit /b 0
