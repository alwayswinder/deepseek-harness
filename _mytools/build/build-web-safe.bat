@echo off
setlocal
rem Rebuild only the Web UI (apps\web\dist) with the two protections build.bat
rem applies as well: esbuild's temp file stays inside the repository, and the last
rem good dist is restored when the build fails, so a running DSH never loses the
rem page it is serving.
rem
rem Use this instead of a bare `pnpm run build:web` while DSH is running.

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "DSH_REPO=%%~fI"
if not exist "%DSH_REPO%\package.json" (
    echo [web] Cannot find package.json two levels above "%~f0".
    exit /b 2
)
cd /d "%DSH_REPO%" || exit /b 2

rem esbuild hands a large transform request to its service process through a temp
rem file and has that process delete it afterwards; the security agent on this
rem machine denies that delete inside %TEMP%, which fails the Web build. A
rem build-local directory is exempt, and it keeps by-products out of the user's
rem %TEMP% besides.
set "BUILD_TMP=%DSH_REPO%\.cache\tmp"
if not exist "%BUILD_TMP%" mkdir "%BUILD_TMP%" >nul 2>&1
if exist "%BUILD_TMP%" (
    set "TMP=%BUILD_TMP%"
    set "TEMP=%BUILD_TMP%"
)

set "GUARDED="
call :guard backup
if errorlevel 2 (
    echo [web] apps\web\dist holds no page to preserve; building a fresh one.
) else (
    if errorlevel 1 (
        echo [web] WARNING: could not save apps\web\dist; a failed build leaves no Web UI.
    ) else (
        set "GUARDED=1"
    )
)

where pnpm >nul 2>&1
if errorlevel 1 goto :noPnpm
call pnpm run build:web
if errorlevel 1 goto :failed

if defined GUARDED call :guard clear
echo [web] Rebuilt apps\web\dist.
exit /b 0

:failed
if defined GUARDED call :guard restore
echo [web] Web build failed; the page DSH was serving is back in apps\web\dist.
exit /b 1

:noPnpm
if defined GUARDED call :guard clear
echo [web] pnpm was not found on PATH; nothing was built.
exit /b 2

rem Keep the guard's own exit code (0/1), so the caller can report a failed copy.
:guard
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%web-dist-guard.ps1" -Action %~1 -Repo "%DSH_REPO%"
exit /b %errorlevel%
