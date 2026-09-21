@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Give the out-of-tree plugins under Plugins\ the peer packages their host
rem halves import as values: @deepseek-ai/schemastery and
rem @deepseek-ai/dsh-credentials.
rem
rem A plugin added to a profile as a bare path, or as file:<abs> on a machine
rem where pnpm records the link protocol, stays a junction to this source
rem directory: its files load from here. Node resolves a bare import by walking
rem up from the importing file, and a pnpm workspace never creates
rem <repo>\node_modules\@deepseek-ai\schemastery (every package gets its own
rem link), so the import fails with ERR_MODULE_NOT_FOUND and the profile
rem reports the bundle as failed to enable. Each junction below names the copy
rem of that package this checkout itself loads, so the plugin and the Host
rem share one module instance.
rem
rem A plugin built in place keeps its own node_modules and resolves these
rem imports there instead; the junctions are what let a linked plugin that has
rem no node_modules of its own load.
rem
rem build.bat, build-desktop.bat, start-dsh.bat and start-desktop.bat call this,
rem so a machine needs no manual setup beyond running one of them.
rem ============================================================

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"

set "PLUGIN_MODULE_ROOT=%~dp0Plugins\node_modules\@deepseek-ai"
set "PLUGIN_FAILED="

rem One call per peer package: its name under @deepseek-ai, and the directory
rem in this checkout that holds the copy the harness loads.
call :linkPeer schemastery "%DSH_REPO%\vendor\schemastery"
call :linkPeer dsh-credentials "%DSH_REPO%\packages\credentials\credentials"

if defined PLUGIN_FAILED exit /b 1
exit /b 0

rem ============================================================
rem Link one peer package into Plugins\node_modules.
rem %1 = package name under @deepseek-ai, %2 = directory holding it.
rem Sets PLUGIN_FAILED when the link cannot be made.
rem ============================================================
:linkPeer
set "PLUGIN_PEER_NAME=%~1"
set "PLUGIN_PEER_TARGET=%~2"
set "PLUGIN_MODULE_LINK=%PLUGIN_MODULE_ROOT%\%PLUGIN_PEER_NAME%"

if not exist "%PLUGIN_PEER_TARGET%\package.json" (
    echo [plugins] WARNING: %PLUGIN_PEER_TARGET% is missing.
    echo [plugins] The out-of-tree plugins cannot resolve @deepseek-ai/%PLUGIN_PEER_NAME%.
    set "PLUGIN_FAILED=1"
    goto :eof
)

rem A link whose target bracket already names this checkout is this machine's
rem finished state, so a machine that ran this before writes nothing. dir /al
rem prints each reparse point of a directory with its target in brackets.
set "PLUGIN_LINK_TARGET="
for /f "tokens=2 delims=[]" %%T in ('dir /al "%PLUGIN_MODULE_ROOT%" 2^>nul ^| findstr /i /c:"%PLUGIN_PEER_NAME% ["') do set "PLUGIN_LINK_TARGET=%%T"
if /i "%PLUGIN_LINK_TARGET%"=="%PLUGIN_PEER_TARGET%" (
    echo [plugins] @deepseek-ai/%PLUGIN_PEER_NAME%: already linked.
    goto :eof
)

rem Replace a link only. A real directory here is someone else's file.
fsutil reparsepoint query "%PLUGIN_MODULE_LINK%" >nul 2>&1
if not errorlevel 1 rmdir "%PLUGIN_MODULE_LINK%" >nul 2>&1
if exist "%PLUGIN_MODULE_LINK%\" (
    echo [plugins] WARNING: %PLUGIN_MODULE_LINK% exists and is not a junction.
    echo [plugins] Remove it so this script can link @deepseek-ai/%PLUGIN_PEER_NAME%.
    set "PLUGIN_FAILED=1"
    goto :eof
)

if not exist "%PLUGIN_MODULE_ROOT%" mkdir "%PLUGIN_MODULE_ROOT%"
mklink /J "%PLUGIN_MODULE_LINK%" "%PLUGIN_PEER_TARGET%" >nul
if errorlevel 1 (
    echo [plugins] WARNING: could not link %PLUGIN_MODULE_LINK% to %PLUGIN_PEER_TARGET%.
    set "PLUGIN_FAILED=1"
    goto :eof
)
echo [plugins] Linked @deepseek-ai/%PLUGIN_PEER_NAME%.
goto :eof
