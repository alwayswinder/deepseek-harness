@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Build this DSH checkout. One script for both ends:
rem
rem   build.bat              both ends: packages, CLI, Web UI, and the Electron
rem                          desktop app with its prepared development runtime
rem                           (the Desktop build already contains the Web build)
rem   build.bat desktop      same as no argument
rem   build.bat web          Web/CLI only: no Electron, no runtime download
rem   build.bat quick        rebuild the host half in place, keeping this app running
rem                           (see "quick" below: it touches no client bundle)
rem   build.bat repair       drop every node_modules, reinstall from scratch, then
rem                          build both ends (the blunt fix after a large merge)
rem
rem Flags:
rem   --no-pause             do not wait for a key at the end (agents, scripts)
rem   --detached             run outside this process tree, showing output while
rem                          also logging it, so the build survives the app it
rem                          closes; add --restart to bring the app back on success
rem   --restart              with --detached: start-desktop.bat after a good build
rem   --log <path>           log file of a detached run (set by --detached)
rem
rem Why "quick" exists: a full build stops this checkout's Electron and then
rem deletes apps\desktop\.desktop-build, which is where that app runs from, so a
rem build started from inside DSH cannot finish. "quick" skips clean and the
rem runtime preparation and rebuilds the host half in place instead; the
rem development project links every package, so the next start picks the new code
rem up. It deliberately leaves the Web UI and every lib/client.js alone - this app
rem polls those bundles and reloads the browser on change, so rewriting them under
rem a running page breaks it - which means a client or Web change needs a full
rem build, and a restart (or Electron, or the bundled runtime changing) needs one
rem too.
rem
rem This script lives in _mytools\build, so the repository root is two levels up.
rem ============================================================

rem ---- arguments --------------------------------------------------------------
rem The absolute script location, computed once: `%~dp0` is empty when the script
rem is invoked by a bare relative name (an agent running `build.bat` from its own
rem folder), and every path below is built from these instead.
for %%I in ("%~f0") do set "SCRIPT_PATH=%%~fI"
for %%I in ("%SCRIPT_PATH%") do set "SCRIPT_DIR=%%~dpI"

set "MODE=desktop"
set "NOPAUSE="
set "DETACHED="
set "RESTART="
set "LOG_PATH="
:parseArgs
if "%~1"=="" goto :argsDone
if /i "%~1"=="desktop" set "MODE=desktop" & shift & goto :parseArgs
if /i "%~1"=="both" set "MODE=desktop" & shift & goto :parseArgs
if /i "%~1"=="web" set "MODE=web" & shift & goto :parseArgs
if /i "%~1"=="quick" set "MODE=quick" & shift & goto :parseArgs
if /i "%~1"=="repair" set "MODE=repair" & shift & goto :parseArgs
if /i "%~1"=="--no-pause" set "NOPAUSE=1" & shift & goto :parseArgs
if /i "%~1"=="--detached" set "DETACHED=1" & shift & goto :parseArgs
if /i "%~1"=="--restart" set "RESTART=1" & shift & goto :parseArgs
if /i "%~1"=="--log" set "LOG_PATH=%~2" & shift & shift & goto :parseArgs
echo [build] Unknown argument: %~1
echo [build] Modes: desktop (default^), web, quick, repair. Flags: --no-pause --detached --restart --log ^<path^>
exit /b 2
:argsDone
if defined RESTART set "RESTART_ARG= -Restart"

rem What gets built: repair builds both ends too, and only adds the reinstall step.
set "TARGET=desktop"
if /i "%MODE%"=="web" set "TARGET=web"
if /i "%MODE%"=="repair" set "REPAIR=1"

rem Remove injected launch variables that can interfere with the pnpm shim.
set "NODE_OPTIONS="
set "CODEBUDDY_SESSION_ID="
set "CLAUDE_SESSION_ID="
rem Clear stale npm/npx injects inherited from a parent npm process.
for /f "delims==" %%V in ('set ^| findstr /b /i "NPM_ npm_config_ npm_execpath npm_command npm_lifecycle_ npm_package_json npm_node_execpath"') do set "%%V="

for %%I in ("%SCRIPT_DIR%..\..") do set "DSH_REPO=%%~fI"
if not exist "%DSH_REPO%\package.json" goto :missingRepo
cd /d "%DSH_REPO%" || goto :finishUnexpected

rem ---- detached hand-off ------------------------------------------------------
rem The build stops this checkout's Electron, so a run started from inside the app
rem must not be its descendant. WMI starts it instead; a runner keeps output in
rem the new console and a log under the harness home.
if defined DETACHED goto :detach

echo [build] Mode: %MODE%
echo [build] Repository: %DSH_REPO%

rem ---- preflight --------------------------------------------------------------
rem Cheap checks for what an upstream merge breaks most often, run before
rem anything is deleted or stopped. It is a warning-free no-op on a healthy tree.
call :findNode
if defined NODE_CMD (
    "%NODE_CMD%" "%SCRIPT_DIR%preflight.mjs" --mode %MODE%
    if errorlevel 2 goto :finishPreflight
    if errorlevel 1 echo [build] preflight could not run; continuing without it.
) else (
    echo [build] Node was not found for the preflight check; continuing without it.
)

rem ---- out-of-tree plugins ----------------------------------------------------
rem The plugins under _mytools\Plugins need their peer links and their own builds.
rem Both steps are idempotent and run in every mode.
call "%SCRIPT_DIR%ensure-plugin-modules.bat"
if errorlevel 1 goto :finishPlugins

call :findPnpm
if not defined PNPM_CMD goto :missingPnpm
echo [build] pnpm command: %PNPM_CMD%

call "%SCRIPT_DIR%ensure-plugin-builds.bat" "%PNPM_CMD%"
if errorlevel 1 goto :finishPlugins

rem ---- mode: repair -----------------------------------------------------------
rem Repair is a full build that starts by dropping the installed dependencies, and
rem that has to happen with the app stopped: the running Electron holds files
rem under node_modules open, so a removal attempted first would half-fail and
rem leave exactly the mixed tree this mode exists to clear.
if defined REPAIR (
    echo [build] Repair: stopping this checkout's Desktop instance first...
    call :stopRepositoryDesktop
    if errorlevel 1 goto :finishStop
    echo [build] Repair: removing installed dependencies...
    call :removeInstalledModules
    if errorlevel 1 goto :finishInstall
)

rem ---- dependencies -----------------------------------------------------------
rem A frozen install answers "does the lockfile still match every package.json?"
rem in the same step that installs: it fails outright when an upstream merge
rem changed dependencies without the lockfile, which only a real install repairs.
rem The quick mode cannot do that (it needs the full build's clean pass), so it
rem stops with the reason instead.
echo [build] Checking dependencies against the lockfile...
call "%PNPM_CMD%" install --frozen-lockfile
if errorlevel 1 (
    if /i "%MODE%"=="quick" goto :finishLockDrift
    echo [build] The lockfile is out of date; installing what the manifests declare...
    call "%PNPM_CMD%" install
    if errorlevel 1 goto :finishInstall
)

rem ---- mode: quick ------------------------------------------------------------
rem The host half only, and deliberately so: the Web UI and every lib/client.js
rem belong to the running renderer, and this app polls those bundles every 500ms
rem (packages/client/hmr) and pushes a reload to the browser. Rewriting them in
rem place therefore makes the browser import half-written modules and the page
rem comes up blank until it is reloaded - measured, not guessed. The host face
rem writes no client bundle, so this mode cannot race it; it still needs a
rem restart, because host code is read at process start.
if /i "%MODE%"=="quick" (
    echo [build] Rebuilding the host half in place ^(packages host face, CLI, Electron shell^)...
    call "%PNPM_CMD%" run build:lib:host
    if errorlevel 1 goto :finishBuild
    call "%PNPM_CMD%" run build:desktop
    if errorlevel 1 goto :finishBuild
    if not exist "%DSH_REPO%\apps\cli\lib\bin.js" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\cli\lib\profile-boot.js" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop\lib\main.js" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop-host\lib\index.js" goto :missingArtifacts
    rem Not rebuilt here, but the app cannot serve a UI without it.
    if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :finishNoWeb
    call :writeRevision
    if errorlevel 1 goto :finishRevision
    echo.
    echo [build] Rebuilt the host half in place. Restart the app to load it.
    echo [build] Client or Web changes are not covered by this mode; use it without
    echo [build] --detached only for host-side edits, and a full build otherwise.
    call :finish done 0
    exit /b 0
)

rem ---- mode: web / desktop ----------------------------------------------------
if /i "%TARGET%"=="desktop" (
    call :prepareDownloadCache
    if errorlevel 1 goto :finishInstall
)

rem A running development Desktop keeps desktop.log open, which makes clean fail on
rem Windows, and clean removes .desktop-build - the tree the app runs from.
echo [build] Stopping this checkout's Desktop instance before cleaning...
call :stopRepositoryDesktop
if errorlevel 1 goto :finishStop

if /i "%TARGET%"=="desktop" (
    rem The prepared primary runtime is an immutable cache junction. Detach it
    rem before clean removes .desktop-build so the cache target stays outside it.
    call :detachCachedPrimaryRuntime
    if errorlevel 1 goto :finishStop
)

rem Carry the Desktop profile's Electron browser data out of the tree this clean
rem deletes (see migrate-desktop-user-data.bat). The Desktop instance is stopped
rem by now, so nothing holds its cookie databases open.
call "%SCRIPT_DIR%migrate-desktop-user-data.bat"

echo [build] Cleaning previous build outputs...
call "%PNPM_CMD%" run clean
if errorlevel 1 goto :finishClean

echo [build] Building DSH packages, CLI, and Web UI...
call "%PNPM_CMD%" run build
if errorlevel 1 goto :finishBuild

if /i "%TARGET%"=="desktop" (
    echo [build] Building the Electron shell...
    call "%PNPM_CMD%" run build:desktop
    if errorlevel 1 goto :finishDesktopShell

    echo [build] Preparing the development project and bundled runtime...
    call "%PNPM_CMD%" exec tsx "%SCRIPT_DIR%prepare-desktop.ts"
    if errorlevel 1 goto :finishPrepare

    rem start-desktop.bat loads these directly; a successful root command must not
    rem leave a partial Desktop build behind.
    if not exist "%DSH_REPO%\apps\desktop\lib\main.js" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop-host\lib\index.js" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop\node_modules\electron\dist\electron.exe" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop\.desktop-build\development\project\desktop-runtime.json" goto :missingArtifacts
    if not exist "%DSH_REPO%\apps\desktop\.desktop-build\targets\win-x64\runtime\primary-runtime\runtime.json" goto :missingArtifacts
)

if not exist "%DSH_REPO%\apps\cli\lib\bin.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\cli\lib\profile-boot.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :missingArtifacts

call :writeRevision
if errorlevel 1 goto :finishRevision

rem The composed Web profile is what start-dsh.bat boots; a preset naming a package
rem the merge removed fails there, not here.
if defined NODE_CMD (
    "%NODE_CMD%" "%SCRIPT_DIR%check-presets.mjs"
    if errorlevel 2 echo [build] Skipped the preset check: the built CLI is missing.
    if errorlevel 1 goto :finishPresets
)

rem The next line is what to do next, printed before the summary and its pause.
if /i "%TARGET%"=="desktop" (
    echo [build] Now run start-desktop.bat.
) else (
    echo [build] Now run start-dsh.bat.
)
call :finish done 0
exit /b 0

rem ============================================================
rem helpers
rem ============================================================

rem Launch the build outside this process tree; the detached child runs this same
rem script and writes its outcome where a later reader can find it.
:detach
echo [build] Detaching the %MODE% build...
set "DETACH_ARGS=-NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%detach.ps1" -Script "%SCRIPT_PATH%" -Mode %MODE%"
if defined LOG_PATH set "DETACH_ARGS=%DETACH_ARGS% -Log "%LOG_PATH%""
if defined RESTART set "DETACH_ARGS=%DETACH_ARGS% -Restart"
powershell.exe %DETACH_ARGS%
if errorlevel 1 goto :finishUnexpected
exit /b 0

rem Keep immutable upstream archives outside .desktop-build, which clean removes.
rem A subroutine rather than a block: the paths are set and used on the same run.
:prepareDownloadCache
set "DESKTOP_DOWNLOAD_CACHE=%DSH_REPO%\.cache\desktop-downloads"
if not exist "%DESKTOP_DOWNLOAD_CACHE%" mkdir "%DESKTOP_DOWNLOAD_CACHE%"
if errorlevel 1 exit /b 1
echo [build] Runtime download cache: %DESKTOP_DOWNLOAD_CACHE%
set "LEGACY_DESKTOP_DOWNLOAD_CACHE=%DSH_REPO%\apps\desktop\.desktop-build\downloads"
if exist "%LEGACY_DESKTOP_DOWNLOAD_CACHE%\" (
    echo [build] Preserving cached runtime downloads...
    robocopy "%LEGACY_DESKTOP_DOWNLOAD_CACHE%" "%DESKTOP_DOWNLOAD_CACHE%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 >nul
    if errorlevel 8 exit /b 1
)
exit /b 0

rem The log a detached run writes to: under the harness home, so build output
rem never lands in the repository.
:writeRevision
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "BUILD_REVISION=%%H"
if not defined BUILD_REVISION exit /b 1
> "%DSH_REPO%\apps\web\dist\.dsh-build-revision" echo %BUILD_REVISION%
exit /b 0

rem End the run through finish.ps1, which records the outcome for the next reader.
:finish
call :finishImpl %1 %2
exit /b %2

:finishImpl
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%finish.ps1" -Mode "%MODE%" -Step "%~1" -ExitCode %~2 -LogPath "%LOG_PATH%"%RESTART_ARG%
echo.
if not defined NOPAUSE pause
exit /b %~2

rem Locate Node for the preflight and preset checks; Explorer launches may have a
rem different PATH. Leaves NODE_CMD unset when no candidate exists.
:findNode
set "NODE_CMD="
for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined NODE_CMD set "NODE_CMD=%%N"
)
if defined NODE_CMD exit /b 0
if exist "%ProgramFiles%\nodejs\node.exe" ( set "NODE_CMD=%ProgramFiles%\nodejs\node.exe" & exit /b 0 )
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\node.exe" ( set "NODE_CMD=%%D\node.exe" & exit /b 0 )
)
exit /b 1

:removeInstalledModules
rem Every workspace module tree goes, plus the root one. `apps\desktop` keeps its
rem own: that tree holds the Electron binary, whose postinstall downloads it from
rem GitHub, and re-fetching 100 MB is not what a dependency repair is about.
for /d %%D in ("%DSH_REPO%\packages\*") do (
    for /d %%P in ("%%D\*") do (
        if exist "%%P\node_modules" rmdir /s /q "%%P\node_modules"
    )
)
for /d %%A in ("%DSH_REPO%\apps\*") do (
    if /i not "%%~nxA"=="desktop" (
        if exist "%%A\node_modules" rmdir /s /q "%%A\node_modules"
    )
)
if exist "%DSH_REPO%\node_modules" rmdir /s /q "%DSH_REPO%\node_modules"
exit /b 0

:stopRepositoryDesktop
if not exist "%DSH_REPO%\apps\desktop\node_modules\electron\dist\electron.exe" exit /b 0
powershell.exe -NoProfile -Command "$target = [IO.Path]::GetFullPath((Join-Path $env:DSH_REPO 'apps\desktop\node_modules\electron\dist\electron.exe')); $processes = @(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target }); if ($processes.Count -gt 0) { $processes | Stop-Process -Force -ErrorAction Stop }"
exit /b %errorlevel%

:detachCachedPrimaryRuntime
set "DESKTOP_PRIMARY_RUNTIME=%DSH_REPO%\apps\desktop\.desktop-build\targets\win-x64\runtime\primary-runtime"
fsutil reparsepoint query "%DESKTOP_PRIMARY_RUNTIME%" >nul 2>&1
if errorlevel 1 exit /b 0
echo [build] Detaching cached primary runtime before cleaning...
rmdir "%DESKTOP_PRIMARY_RUNTIME%"
exit /b %errorlevel%

rem ============================================================
rem failure exits
rem ============================================================

:finishPreflight
echo.
echo [build] The preflight check found a blocking problem; nothing was changed.
call :finish preflight 2
exit /b 2

:finishPlugins
echo.
echo [build] The out-of-tree plugin setup failed. See the [plugins] message above.
call :finish plugins 1
exit /b 1

:finishLockDrift
echo.
echo [build] Dependencies changed since the lockfile was written ^(usually an upstream merge^).
echo [build] The quick mode cannot repair that; run build.bat ^(full^) once, which reinstalls
echo [build] and cleans the outputs, then use quick again.
call :finish lockfile 3
exit /b 3

:finishInstall
call :finish install 1
exit /b 1

:finishStop
call :finish stop-electron 1
exit /b 1

:finishClean
call :finish clean 1
exit /b 1

:finishBuild
call :finish build 1
exit /b 1

:finishDesktopShell
call :finish build-desktop 1
exit /b 1

:finishPrepare
call :finish prepare-desktop 1
exit /b 1

:finishRevision
call :finish revision 1
exit /b 1

:finishPresets
echo.
echo [build] A preset names a package the composed profile cannot resolve.
echo [build] Run: node _mytools\build\check-presets.mjs
call :finish presets 1
exit /b 1

:finishNoWeb
echo.
echo [build] apps\web\dist is missing, so there is no Web UI for the app to serve.
echo [build] The quick mode does not rebuild it; run a full build first.
call :finish web-artifacts 1
exit /b 1

:missingArtifacts
echo.
echo [build] The build reported success but a required artifact is missing.
echo [build] Check the build output above, then run this script again.
call :finish verify 1
exit /b 1

:missingRepo
echo [build] Cannot find package.json relative to this script.
echo [build] Keep this file in the repository's _mytools\build folder.
call :finish repository 1
exit /b 1

:missingPnpm
echo [build] pnpm was not found on PATH, in the npm global directory, or under
echo [build] %USERPROFILE%\.workbuddy\binaries\node\versions.
echo [build] Install pnpm (or Node.js with Corepack) and try again.
call :finish pnpm 1
exit /b 1

:finishUnexpected
call :finish unexpected 1
exit /b 1

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
