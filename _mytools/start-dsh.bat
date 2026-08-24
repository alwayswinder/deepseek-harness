@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============================================================
rem Start DSH Web. Prefer the local source checkout, then npx.
rem The status window may be closed after the service starts.
rem The current launch log is dsh-web.log next to this script.
rem Use stop-dsh.bat to stop the default port 3080.
rem This script must remain in a direct child folder of the repository root.
rem The local checkout requires pnpm install and pnpm run build.
rem ============================================================

rem Remove injected launch variables that can interfere with the pnpm shim.
set "NODE_OPTIONS="
set "CODEBUDDY_SESSION_ID="
set "CLAUDE_SESSION_ID="

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"
set "DSH_LOG=%~dp0dsh-web.log"

rem Clear the previous launch log.
break > "%DSH_LOG%"

rem ---- Prefer the local source checkout ----
if not exist "%DSH_REPO%\node_modules" goto :fallback
if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :fallback

rem ---- Locate pnpm; Explorer launches may have a different PATH ----
rem 1) Available on PATH.
where pnpm >nul 2>&1
if not errorlevel 1 (
    set "PNPM_CMD=pnpm.cmd"
    goto :local
)
rem 2) Global npm directory.
if exist "%APPDATA%\npm\pnpm.cmd" (
    set "PNPM_CMD=%APPDATA%\npm\pnpm.cmd"
    goto :local
)
rem 3) WorkBuddy managed Node directories.
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\pnpm.cmd" (
        set "PNPM_CMD=%%D\pnpm.cmd"
        goto :local
    )
)
goto :fallback

:local
echo [dsh] Using local source repository: %DSH_REPO%
echo [dsh] pnpm command: %PNPM_CMD%
echo.
echo [dsh] Starting the service in the background (no browser)...
wscript "%~dp0start-dsh-service.vbs" "%PNPM_CMD%" "dsh web --no-open" "%DSH_LOG%" "%DSH_REPO%"
echo.
echo [dsh] Launch requested. This window can now be closed.
echo [dsh] Log: %DSH_LOG%
echo [dsh] Stop: run stop-dsh.bat
pause
exit /b 0

:fallback
echo [dsh] Local repository or pnpm unavailable; falling back to npx.
echo [dsh] For local startup, run pnpm install and pnpm run build in %DSH_REPO%.
echo.
echo [dsh] Starting the service in the background (no browser)...
wscript "%~dp0start-dsh-service.vbs" "npx.cmd" "--yes @deepseek-ai/dsh web --no-open" "%DSH_LOG%" "%DSH_REPO%"
echo.
echo [dsh] Launch requested. This window can now be closed. Log: %DSH_LOG%
pause
exit /b 0
