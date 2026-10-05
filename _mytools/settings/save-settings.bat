@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Save this machine's portable settings into the repository files under
rem _mytools\settings\ (the pet's profile section and the Desktop's shortcut
rem document), so another machine gets them from `git pull` alone: the launcher,
rem or the pet's own restart, merges them back before DSH starts.
rem
rem Double-click it, then commit and push yourself. %1 selects the profile;
rem without it the desktop profile is used.
rem ============================================================

if "%~1"=="" (set "PROFILE_NAME=desktop") else (set "PROFILE_NAME=%~1")

rem Resolve the repository root from this script's own location.
for %%I in ("%~dp0..\..") do set "DSH_REPO=%%~fI"

where node >nul 2>&1
if errorlevel 1 (
    echo [settings] Node.js was not found; install it or add it to PATH.
    goto :failure
)

node "%~dp0sync-settings.mjs" export --profile "%PROFILE_NAME%"
if errorlevel 1 goto :failure

echo.
echo [settings] Changed files:
git -C "%DSH_REPO%" status --short -- _mytools/settings/pet-settings.yml _mytools/settings/keybindings.json

echo.
echo [settings] Commit and push, then the other machine applies them on its next launch.
if not defined DSH_NO_PAUSE pause
exit /b 0

:failure
echo.
echo [settings] Nothing was written; see the reason above.
if not defined DSH_NO_PAUSE pause
exit /b 1
