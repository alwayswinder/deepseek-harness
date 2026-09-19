@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Give the out-of-tree plugins under Plugins\ the one peer dependency their
rem host halves import: @deepseek-ai/schemastery.
rem
rem A plugin added to a profile as a bare path, or as file:<abs> on a machine
rem where pnpm records the link protocol, stays a junction to this source
rem directory: its files load from here. Node resolves a bare import by walking
rem up from the importing file, and a pnpm workspace never creates
rem <repo>\node_modules\@deepseek-ai\schemastery (every package gets its own
rem link), so the import fails with ERR_MODULE_NOT_FOUND and the profile
rem reports the bundle as failed to enable. The junction below resolves to the
rem same vendor\schemastery the harness itself loads, so the plugin and the
rem Host share one module instance.
rem
rem build.bat, build-desktop.bat, start-dsh.bat and start-desktop.bat call this,
rem so a machine needs no manual setup beyond running one of them.
rem ============================================================

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"

set "PLUGIN_PEER_TARGET=%DSH_REPO%\vendor\schemastery"
set "PLUGIN_MODULE_ROOT=%~dp0Plugins\node_modules\@deepseek-ai"
set "PLUGIN_MODULE_LINK=%PLUGIN_MODULE_ROOT%\schemastery"

if not exist "%PLUGIN_PEER_TARGET%\package.json" (
    echo [plugins] WARNING: %PLUGIN_PEER_TARGET% is missing.
    echo [plugins] The out-of-tree plugins cannot resolve @deepseek-ai/schemastery.
    exit /b 1
)

rem A junction already naming this checkout is this machine's finished state.
set "PLUGIN_LINK_TARGET="
for /f "tokens=2 delims=[]" %%T in ('dir /al "%PLUGIN_MODULE_ROOT%" 2^>nul ^| findstr /i "schemastery"') do set "PLUGIN_LINK_TARGET=%%T"
if /i "%PLUGIN_LINK_TARGET%"=="%PLUGIN_PEER_TARGET%" (
    echo [plugins] The out-of-tree plugins resolve @deepseek-ai/schemastery.
    exit /b 0
)

rem Replace a link only. A real directory here is someone else's file.
fsutil reparsepoint query "%PLUGIN_MODULE_LINK%" >nul 2>&1
if not errorlevel 1 rmdir "%PLUGIN_MODULE_LINK%" >nul 2>&1
if exist "%PLUGIN_MODULE_LINK%\" (
    echo [plugins] WARNING: %PLUGIN_MODULE_LINK% exists and is not a junction.
    echo [plugins] Remove it so this script can link the vendored schemastery.
    exit /b 1
)

if not exist "%PLUGIN_MODULE_ROOT%" mkdir "%PLUGIN_MODULE_ROOT%"
mklink /J "%PLUGIN_MODULE_LINK%" "%PLUGIN_PEER_TARGET%" >nul
if errorlevel 1 (
    echo [plugins] WARNING: could not link %PLUGIN_MODULE_LINK% to %PLUGIN_PEER_TARGET%.
    exit /b 1
)
echo [plugins] Linked @deepseek-ai/schemastery for the out-of-tree plugins.
exit /b 0
