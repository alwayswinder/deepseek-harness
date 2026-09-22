@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Logitech G HUB starts this batch with stdout and stderr already closed, and
rem cmd.exe terminates on the first console write while both are unusable (a G4
rem macro press died on ensure-plugin-modules.bat's "[plugins] ..." line before the
rem service was ever started). One usable stream is enough, so re-run this script
rem once with stderr on a log file under %TEMP% and let that copy do the launch.
rem stdout stays on the console, which keeps the status messages and the pauses
rem working when the script is started from Explorer or a terminal.
if "%~1"=="redirected" goto :streamsReady
set "DSH_ERR_LOG=%TEMP%\dsh-web-stderr.log"
copy /y nul "%DSH_ERR_LOG%" >nul 2>&1
if errorlevel 1 set "DSH_ERR_LOG=%TEMP%\dsh-web-stderr-%RANDOM%.log"
call "%~f0" redirected %* 2> "%DSH_ERR_LOG%"
exit /b 0

:streamsReady
if "%~1"=="redirected" shift

rem ============================================================
rem Start DSH Web.
rem
rem Launch order: the locally built checkout, then the globally installed dsh
rem CLI, then npx.
rem
rem The local checkout always starts from its built output
rem (apps\cli\lib\bin.js) under plain node. Starting the same tree through tsx
rem (`pnpm dsh web`) puts two module planes in one process: profile plugin
rem entries resolve to packages\*\lib, while tsconfig `paths` rewrite their bare
rem package imports to packages\*\src. The tool registry and the agent loop then
rem hold different @deepseek-ai/dsh-tools module instances, so every tool call
rem fails with "Cannot read properties of undefined (reading 'prepare')" and the
rem turn ends before any tool result is recorded.
rem
rem Run build.bat after pulling or editing packages\*, then run this script.
rem
rem Usage: start-dsh.bat [port]   (default port 3080)
rem The status window may be closed after the service starts.
rem The current launch log is dsh-web.log next to this script; when a running
rem service still holds that file, the launch uses dsh-web-<random>.log instead.
rem Use stop-dsh.bat [port] to stop the service.
rem This script must remain in a direct child folder of the repository root.
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
set "DSH_PORT=3080"
if not "%~1"=="" set "DSH_PORT=%~1"
rem Arguments are passed to the service script individually, so a port can be
rem appended without re-quoting the whole command line.
set "DSH_WEB_ARGS=web --no-open --port %DSH_PORT%"

rem Out-of-tree plugin this launcher enables on the web profile before every
rem start (see :ensureUsagePlugin): usage & balance card on the settings page.
set "DSH_USAGE_DIR=%~dp0Plugins\deepseek-usage"
set "DSH_USAGE_URL=file:%DSH_USAGE_DIR:\=/%"

rem The out-of-tree plugins import @deepseek-ai/schemastery from their own
rem directory; link the vendored copy so a profile can load them on this machine.
call "%~dp0ensure-plugin-modules.bat"

rem The launching cmd.exe holds the log file open for the whole life of the service
rem it started (start-dsh-service.vbs redirects the service output there), so while
rem a service is running the redirection below cannot open this path and cmd.exe
rem exits without ever running node. Fall back to a per-launch log then, and prune
rem fallback logs older than a day.
copy /y nul "%DSH_LOG%" >nul 2>&1
if errorlevel 1 set "DSH_LOG=%~dp0dsh-web-%RANDOM%.log"
forfiles /p "%~dp0." /m "dsh-web-*.log" /d -1 /c "cmd /c del @path" >nul 2>&1

rem ---- Prefer the locally built checkout ----
if not exist "%DSH_REPO%\node_modules" goto :needsBuild
if not exist "%DSH_REPO%\apps\cli\lib\bin.js" goto :needsBuild
if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :needsBuild
call :findPnpm
call :findNode
if not defined NODE_CMD goto :missingNode
goto :local

:needsBuild
echo [dsh] The local checkout is not built yet.
echo [dsh] Run "%~dp0build.bat" once, then start this script again.
goto :fallback

:missingNode
echo [dsh] Node.js was not found, so the local build cannot be started.
echo [dsh] Install Node.js (see package.json engines) or add it to PATH.
goto :fallback

:local
echo [dsh] Using the local build: %DSH_REPO%\apps\cli\lib\bin.js
echo [dsh] node command: %NODE_CMD%
call :ensureUsagePlugin local
echo.
echo [dsh] Starting the service in the background (no browser)...
wscript "%~dp0start-dsh-service.vbs" "%DSH_LOG%" "%DSH_REPO%" "%NODE_CMD%" "apps\cli\lib\bin.js" %DSH_WEB_ARGS%
echo.
echo [dsh] Launch requested. This window can now be closed.
echo [dsh] URL: http://127.0.0.1:%DSH_PORT%/  (the token link is in the log)
echo [dsh] Log: %DSH_LOG%
echo [dsh] Stop: run stop-dsh.bat %DSH_PORT%
pause
exit /b 0

:fallback
rem Prefer the globally installed dsh CLI over a registry download: the npm
rem registry fetch is slow and the launch environment can break npm's launcher.
if exist "%APPDATA%\npm\dsh.cmd" (
    echo [dsh] Using the globally installed dsh CLI instead.
    echo.
    call :ensureUsagePlugin global
    echo.
    echo [dsh] Starting the service in the background ^(no browser^)...
    wscript "%~dp0start-dsh-service.vbs" "%DSH_LOG%" "%DSH_REPO%" "%APPDATA%\npm\dsh.cmd" %DSH_WEB_ARGS%
    echo.
    echo [dsh] Launch requested. This window can now be closed.
    echo [dsh] Log: %DSH_LOG%
    pause
    exit /b 0
)
echo [dsh] Local build and global dsh unavailable; falling back to npx.
call :ensureUsagePlugin npx
echo.
echo [dsh] Starting the service in the background (no browser)...
wscript "%~dp0start-dsh-service.vbs" "%DSH_LOG%" "%DSH_REPO%" "npx.cmd" --yes @deepseek-ai/dsh %DSH_WEB_ARGS%
echo.
echo [dsh] Launch requested. This window can now be closed. Log: %DSH_LOG%
pause
exit /b 0

rem ============================================================
rem Locate pnpm; Explorer launches may have a different PATH.
rem Sets PNPM_CMD, or leaves it unset when no candidate exists.
rem ============================================================
:findPnpm
set "PNPM_CMD="
rem 1) Available on PATH.
where pnpm >nul 2>&1
if not errorlevel 1 ( set "PNPM_CMD=pnpm.cmd" & exit /b 0 )
rem 2) Global npm directory.
if exist "%APPDATA%\npm\pnpm.cmd" ( set "PNPM_CMD=%APPDATA%\npm\pnpm.cmd" & exit /b 0 )
rem 3) WorkBuddy managed Node directories.
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\pnpm.cmd" ( set "PNPM_CMD=%%D\pnpm.cmd" & exit /b 0 )
)
rem 4) Repo-local pnpm tool install (.pnpm-tools\node_modules\.bin\pnpm.cmd).
if exist "%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd" (
    set "PNPM_CMD=%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd"
    exit /b 0
)
exit /b 1

rem ============================================================
rem Locate node.exe. Prefer the interpreter that ships beside the resolved
rem pnpm, so the launcher and the build stay on one Node version.
rem Sets NODE_CMD, or leaves it unset when no candidate exists.
rem ============================================================
:findNode
set "NODE_CMD="
rem 1) Beside pnpm; npm's global prefix and WorkBuddy node directories carry it.
if defined PNPM_CMD for %%D in ("%PNPM_CMD%") do if exist "%%~dpDnode.exe" ( set "NODE_CMD=%%~dpDnode.exe" & exit /b 0 )
rem 2) Available on PATH.
where node >nul 2>&1
if not errorlevel 1 for /f "delims=" %%P in ('where node') do ( set "NODE_CMD=%%P" & exit /b 0 )
rem 3) Standard Windows install locations.
if exist "%ProgramFiles%\nodejs\node.exe" ( set "NODE_CMD=%ProgramFiles%\nodejs\node.exe" & exit /b 0 )
if exist "%ProgramFiles(x86)%\nodejs\node.exe" ( set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe" & exit /b 0 )
rem 4) WorkBuddy managed Node directories.
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\node.exe" ( set "NODE_CMD=%%D\node.exe" & exit /b 0 )
)
exit /b 1

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
call "%~dp0sync-plugins.bat" web
goto :eof

:usageLocal
rem Registration runs the built CLI: the same entry this launcher starts.
if not defined PNPM_CMD goto :usageNoPnpm
for %%D in ("%PNPM_CMD%") do set "PNPM_BIN_DIR=%%~dpD"
if defined PNPM_BIN_DIR set "PATH=%PNPM_BIN_DIR%;%PATH%"
pushd "%DSH_REPO%"
"%NODE_CMD%" "apps\cli\lib\bin.js" plugin --profile web add "%DSH_USAGE_URL%"
set "USAGE_EXIT=%errorlevel%"
popd
goto :usageDone

:usageNoPnpm
echo [dsh] WARNING: pnpm was not found; skipping the deepseek-usage plugin registration.
call "%~dp0sync-plugins.bat" web
goto :eof

:usageGlobal
call "%APPDATA%\npm\dsh.cmd" plugin --profile web add "%DSH_USAGE_URL%"
set "USAGE_EXIT=%errorlevel%"
goto :usageDone

:usageDone
call "%~dp0sync-plugins.bat" web
if "%USAGE_EXIT%"=="0" goto :usageEnabled
echo [dsh] WARNING: deepseek-usage plugin registration failed (exit %USAGE_EXIT%); web will start without it.
goto :eof

:usageEnabled
echo [dsh] deepseek-usage plugin: enabled.
goto :eof
