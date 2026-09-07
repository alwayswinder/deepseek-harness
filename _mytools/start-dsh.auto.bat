@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============================================================
rem Start DSH Web. Prefer the local source checkout, then the globally
rem installed dsh CLI, then npx.
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

rem Clear stale npm/npx injects inherited from a parent npm process. They make
rem npm's launcher resolve itself against this repository root, where
rem node_modules\npm does not exist, crashing with MODULE_NOT_FOUND for
rem ...\node_modules\npm\bin\npm-prefix.js / npx-cli.js in dsh-web.log.
rem Registry etc. still comes from the user .npmrc, so this is safe to clear.
for /f "delims==" %%V in ('set ^| findstr /b /i "NPM_ npm_config_ npm_execpath npm_command npm_lifecycle_ npm_package_json npm_node_execpath"') do set "%%V="

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"
set "DSH_LOG=%~dp0dsh-web.log"

rem Out-of-tree plugin this launcher enables on the web profile before every
rem start (see :ensureUsagePlugin): usage & balance card on the settings page.
set "DSH_USAGE_DIR=%~dp0Plugins\deepseek-usage"
set "DSH_USAGE_URL=file:%DSH_USAGE_DIR:\=/%"

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
rem 4) Repo-local pnpm tool install (.pnpm-tools\node_modules\.bin\pnpm.cmd).
if exist "%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd" (
    set "PNPM_CMD=%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd"
    goto :local
)
goto :fallback

:local
echo [dsh] Using local source repository: %DSH_REPO%
echo [dsh] pnpm command: %PNPM_CMD%
call :ensureUsagePlugin local
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
rem Prefer the globally installed dsh CLI over a registry download: the npm
rem registry fetch is slow and the launch environment can break npm's launcher.
if exist "%APPDATA%\npm\dsh.cmd" (
    echo [dsh] Local checkout incomplete; using the globally installed dsh.
    echo [dsh] For local startup, run pnpm install and pnpm run build in %DSH_REPO%.
    echo.
    call :ensureUsagePlugin global
    echo.
    echo [dsh] Starting the service in the background (no browser)...
    wscript "%~dp0start-dsh-service.vbs" "%APPDATA%\npm\dsh.cmd" "web --no-open" "%DSH_LOG%" "%DSH_REPO%"
    echo.
    echo [dsh] Launch requested. This window can now be closed.
    echo [dsh] Log: %DSH_LOG%
    pause
    exit /b 0
)
echo [dsh] Local repository or pnpm unavailable; falling back to npx.
echo [dsh] For local startup, run pnpm install and pnpm run build in %DSH_REPO%.
call :ensureUsagePlugin npx
echo.
echo [dsh] Starting the service in the background (no browser)...
wscript "%~dp0start-dsh-service.vbs" "npx.cmd" "--yes @deepseek-ai/dsh web --no-open" "%DSH_LOG%" "%DSH_REPO%"
echo.
echo [dsh] Launch requested. This window can now be closed. Log: %DSH_LOG%
pause
exit /b 0

rem ============================================================
rem Ensure the deepseek-usage plugin is registered in the web profile.
rem `dsh plugin add` is idempotent: when the plugin is already registered it
rem resolves "Already up to date" and reconciles to a no-op, and when the
rem profile is fresh or was reset it installs the package and appends the
rem dsh.profile.bundles row the loader mounts at boot. Running it on every
rem start self-heals any half-registered state.
rem %1 = local | global | npx, matching how this script resolved dsh.
rem ============================================================
:ensureUsagePlugin
if exist "%DSH_USAGE_DIR%\package.json" goto :usageRegister
echo [dsh] WARNING: deepseek-usage plugin source missing at %DSH_USAGE_DIR%; web will start without it.
goto :eof

:usageRegister
echo [dsh] deepseek-usage plugin: registering in the web profile (idempotent)...
if "%1"=="local" goto :usageLocal
if "%1"=="global" goto :usageGlobal
echo [dsh] WARNING: cannot auto-register the plugin while launching through npx. Run this once in a terminal:
echo [dsh]   dsh plugin --profile web add %DSH_USAGE_URL%
goto :eof

:usageLocal
for %%D in ("%PNPM_CMD%") do set "PNPM_BIN_DIR=%%~dpD"
if defined PNPM_BIN_DIR set "PATH=%PNPM_BIN_DIR%;%PATH%"
pushd "%DSH_REPO%"
call "%PNPM_CMD%" dsh plugin --profile web add "%DSH_USAGE_URL%"
set "USAGE_EXIT=%errorlevel%"
popd
goto :usageDone

:usageGlobal
call "%APPDATA%\npm\dsh.cmd" plugin --profile web add "%DSH_USAGE_URL%"
set "USAGE_EXIT=%errorlevel%"
goto :usageDone

:usageDone
if "%USAGE_EXIT%"=="0" goto :usageEnabled
echo [dsh] WARNING: deepseek-usage plugin registration failed (exit %USAGE_EXIT%); web will start without it.
goto :eof

:usageEnabled
echo [dsh] deepseek-usage plugin: enabled.
goto :eof