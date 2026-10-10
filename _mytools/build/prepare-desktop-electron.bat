@echo off
setlocal
chcp 65001 >nul

rem Copy the development Electron distribution outside the checkout. Workspace
rem confinement may change the checkout's ACLs in ways Chromium's own sandbox
rem rejects, while the application code can still be loaded from the checkout.
rem A versioned cache also avoids replacing an executable that is already open.

if "%~1"=="" goto :usage
if not defined LOCALAPPDATA goto :missingLocalAppData

for %%I in ("%~1") do set "ELECTRON_SOURCE=%%~fI"
if not exist "%ELECTRON_SOURCE%\electron.exe" goto :missingSource
if not exist "%ELECTRON_SOURCE%\version" goto :missingSource

set "ELECTRON_VERSION="
for /f "usebackq delims=" %%V in ("%ELECTRON_SOURCE%\version") do if not defined ELECTRON_VERSION set "ELECTRON_VERSION=%%V"
if not defined ELECTRON_VERSION goto :invalidVersion
echo(%ELECTRON_VERSION%| %SystemRoot%\System32\findstr.exe /r /x "[0-9][0-9.]*" >nul
if errorlevel 1 goto :invalidVersion

set "ELECTRON_CACHE=%LOCALAPPDATA%\DeepSeek Harness\development-electron\%ELECTRON_VERSION%"
set "ELECTRON_MARKER=%ELECTRON_CACHE%\.complete"
if exist "%ELECTRON_MARKER%" if exist "%ELECTRON_CACHE%\electron.exe" goto :ready

if not exist "%ELECTRON_CACHE%" mkdir "%ELECTRON_CACHE%"
if errorlevel 1 goto :copyFailure
if exist "%ELECTRON_MARKER%" del /q "%ELECTRON_MARKER%"
robocopy "%ELECTRON_SOURCE%" "%ELECTRON_CACHE%" /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :copyFailure
> "%ELECTRON_MARKER%" echo %ELECTRON_VERSION%
if not exist "%ELECTRON_MARKER%" goto :copyFailure
echo [desktop] Electron %ELECTRON_VERSION% cached outside the checkout.

:ready
endlocal & set "DSH_DESKTOP_ELECTRON_EXE=%ELECTRON_CACHE%\electron.exe"
exit /b 0

:usage
echo [desktop] Electron cache setup needs the source dist directory.
exit /b 1

:missingLocalAppData
echo [desktop] LOCALAPPDATA is not set; cannot prepare the Electron cache.
exit /b 1

:missingSource
echo [desktop] Electron source distribution is incomplete:
echo [desktop]   %ELECTRON_SOURCE%
exit /b 1

:invalidVersion
echo [desktop] Electron source has an invalid version file:
echo [desktop]   %ELECTRON_SOURCE%\version
exit /b 1

:copyFailure
echo [desktop] Could not prepare the Electron cache:
echo [desktop]   %ELECTRON_CACHE%
exit /b 1
