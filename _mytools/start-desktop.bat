@echo off
setlocal

rem Launch the prepared Electron app directly and detach it from this window.
rem Run build-desktop.bat after pulling or changing source files.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"

set "NODE_OPTIONS="
set "ELECTRON_RUN_AS_NODE="
rem Share the normal Harness home so Desktop sees existing Web sessions and settings.
set "DSH_HOME=%USERPROFILE%\.dsh"
set "DSH_DESKTOP_HOST_INSPECT_PORT=9230"
set "DSH_DESKTOP_OPEN_DEVTOOLS=0"
set "ELECTRON_ENABLE_LOGGING=0"

set "DESKTOP_APP=%DSH_REPO%\apps\desktop"
set "DESKTOP_EXE=%DESKTOP_APP%\node_modules\electron\dist\electron.exe"
set "DESKTOP_ARGS=--user-data-dir=%DESKTOP_APP%\.desktop-build\development\electron-user-data %DESKTOP_APP%"
set "DESKTOP_LOG=%DESKTOP_APP%\.desktop-build\development\desktop.log"
break > "%DESKTOP_LOG%"
wscript.exe //nologo "%~dp0start-dsh-service.vbs" "%DESKTOP_EXE%" "%DESKTOP_ARGS%" "%DESKTOP_LOG%" "%DESKTOP_APP%"
exit /b 0
