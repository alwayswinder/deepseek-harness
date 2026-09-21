@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Build the out-of-tree plugins under Plugins\ that ship sources instead of
rem built files.
rem
rem Such a plugin declares its entry points under lib\ and ignores lib\ in its
rem own .gitignore, so a machine that has the sources but never built them
rem loads no entry at all and the profile reports the bundle as failed to
rem enable. This step runs once per machine: an existing lib\index.js is this
rem machine's finished state.
rem
rem The plugin's pinned pnpm-lock.yaml supplies the toolchain, so the first run
rem on a machine needs registry access; later runs reuse node_modules.
rem
rem %1 = pnpm command to use; resolved here when omitted.
rem build.bat and build-desktop.bat call this after locating pnpm.
rem ============================================================

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"

set "PLUGIN_PNPM=%~1"
if not defined PLUGIN_PNPM call :findPnpm
if not defined PLUGIN_PNPM (
    echo [plugins] WARNING: pnpm was not found; the plugin sources cannot be built.
    exit /b 1
)

set "PLUGIN_FAILED="

rem One call per plugin that needs a build: its directory under Plugins\.
call :buildPlugin dsh-ths-holdings

if defined PLUGIN_FAILED exit /b 1
exit /b 0

rem ============================================================
rem Build one plugin in place when its entry file is missing.
rem %1 = plugin directory name under Plugins\.
rem Sets PLUGIN_FAILED when the build cannot run, fails, or leaves no entry.
rem ============================================================
:buildPlugin
set "PLUGIN_DIR=%~dp0Plugins\%~1"

if not exist "%PLUGIN_DIR%\package.json" (
    echo [plugins] WARNING: %PLUGIN_DIR% is not a package; skipping its build.
    set "PLUGIN_FAILED=1"
    goto :eof
)
if exist "%PLUGIN_DIR%\lib\index.js" (
    echo [plugins] %~1: built output present.
    goto :eof
)

echo [plugins] %~1: building from source - first run on this machine...
pushd "%PLUGIN_DIR%"
rem --ignore-workspace keeps the plugin's own pinned lockfile authoritative:
rem the repository above it is a pnpm workspace this directory is not part of.
call "%PLUGIN_PNPM%" install --frozen-lockfile --ignore-workspace
if errorlevel 1 goto :buildFailed
call "%PLUGIN_PNPM%" --ignore-workspace run build
if errorlevel 1 goto :buildFailed
if not exist "%PLUGIN_DIR%\lib\index.js" goto :buildNoEntry
popd
echo [plugins] %~1: built.
goto :eof

:buildNoEntry
echo [plugins] WARNING: %~1 reported a successful build but lib\index.js is missing.
set "PLUGIN_FAILED=1"
popd
goto :eof

:buildFailed
echo [plugins] WARNING: %~1 failed to build; its profile bundle will report failed to enable.
set "PLUGIN_FAILED=1"
popd
goto :eof

rem ============================================================
rem Locate pnpm; Explorer launches may have a different PATH.
rem Sets PLUGIN_PNPM, or leaves it unset when no candidate exists.
rem ============================================================
:findPnpm
set "PLUGIN_PNPM="
rem 1) Available on PATH.
where pnpm >nul 2>&1
if not errorlevel 1 ( set "PLUGIN_PNPM=pnpm.cmd" & exit /b 0 )
rem 2) Global npm directory.
if exist "%APPDATA%\npm\pnpm.cmd" ( set "PLUGIN_PNPM=%APPDATA%\npm\pnpm.cmd" & exit /b 0 )
rem 3) WorkBuddy managed Node directories.
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\pnpm.cmd" ( set "PLUGIN_PNPM=%%D\pnpm.cmd" & exit /b 0 )
)
rem 4) Repo-local pnpm tool install (.pnpm-tools\node_modules\.bin\pnpm.cmd).
if exist "%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd" (
    set "PLUGIN_PNPM=%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd"
    exit /b 0
)
exit /b 1
