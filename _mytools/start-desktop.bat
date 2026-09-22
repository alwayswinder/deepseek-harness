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
exit /b 0

:streamsReady

rem Launch the prepared Electron app directly and detach it from this window.
rem Run build-desktop.bat after pulling or changing source files: the app loads
rem the prepared project under apps\desktop\.desktop-build\development, and that
rem directory exists only after that script has completed.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"

set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE="
rem Share the normal Harness home so Desktop sees existing Web sessions and settings.
set "DSH_HOME=%USERPROFILE%\.dsh"
set "DSH_DESKTOP_HOST_INSPECT_PORT=9230"
set "DSH_DESKTOP_OPEN_DEVTOOLS=0"
set "ELECTRON_ENABLE_LOGGING=0"

set "DESKTOP_APP=%DSH_REPO%\apps\desktop"
set "DESKTOP_DEVELOPMENT=%DESKTOP_APP%\.desktop-build\development"
set "DESKTOP_PROJECT=%DESKTOP_DEVELOPMENT%\project"
set "DESKTOP_EXE=%DESKTOP_APP%\node_modules\electron\dist\electron.exe"
set "DESKTOP_LOG=%DESKTOP_DEVELOPMENT%\desktop.log"

rem The out-of-tree plugins the Desktop profile loads import
rem @deepseek-ai/schemastery from their own directory; link the vendored copy
rem so a plugin installed as a link into the profile can activate.
call "%~dp0ensure-plugin-modules.bat"

rem The profile installs its JavaScript plugins as file: directory copies, which
rem pnpm writes once and never reconciles against the source; refresh them so a
rem pulled plugin change is what this launch loads.
call "%~dp0sync-plugins.bat" desktop

if not exist "%DESKTOP_EXE%" goto :missingElectron
if not exist "%DESKTOP_PROJECT%\desktop-runtime.json" goto :missingRuntime

if not exist "%DESKTOP_DEVELOPMENT%" mkdir "%DESKTOP_DEVELOPMENT%"
rem The launching cmd.exe holds the log file open for the whole life of the app it
rem started (start-dsh-service.vbs redirects the app output there), so while an
rem earlier Desktop instance is alive the redirection below cannot open this path
rem and cmd.exe exits without ever running electron.exe. Fall back to a per-launch
rem log then; Electron still starts, so a second press focuses the open window.
copy /y nul "%DESKTOP_LOG%" >nul 2>&1
if errorlevel 1 set "DESKTOP_LOG=%DESKTOP_DEVELOPMENT%\desktop-%RANDOM%.log"
forfiles /p "%DESKTOP_DEVELOPMENT%" /m "desktop-*.log" /d -1 /c "cmd /c del @path" >nul 2>&1
wscript.exe //nologo "%~dp0start-dsh-service.vbs" "%DESKTOP_LOG%" "%DESKTOP_APP%" "%DESKTOP_EXE%" "--user-data-dir=%DESKTOP_DEVELOPMENT%\electron-user-data" "%DESKTOP_APP%"
echo [desktop] Launch requested. Log: %DESKTOP_LOG%
exit /b 0

:missingElectron
echo [desktop] Electron is not installed at
echo [desktop]   %DESKTOP_EXE%
echo [desktop] Run build-desktop.bat (it installs dependencies) and try again.
pause
exit /b 1

:missingRuntime
echo [desktop] The development runtime is not prepared:
echo [desktop]   %DESKTOP_PROJECT%\desktop-runtime.json
echo [desktop] Run build-desktop.bat first. Preparing that runtime downloads the
echo [desktop] pinned Node and Python runtime, so it needs GitHub and PyPI access.
pause
exit /b 1
