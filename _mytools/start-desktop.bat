@echo off
setlocal
chcp 65001 >nul

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

if not exist "%DESKTOP_EXE%" goto :missingElectron
if not exist "%DESKTOP_PROJECT%\desktop-runtime.json" goto :missingRuntime

if not exist "%DESKTOP_DEVELOPMENT%" mkdir "%DESKTOP_DEVELOPMENT%"
break > "%DESKTOP_LOG%"
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
