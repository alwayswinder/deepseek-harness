@echo off
chcp 65001 >nul

rem ============================================================
rem Build the DSH checkout: dependencies, packages, CLI, and Web UI.
rem Run this after a pull or a source edit; start-dsh.bat serves the Web app
rem from these artifacts (apps\cli\lib\bin.js and apps\web\dist).
rem build-desktop.bat repeats these steps and then prepares the Electron shell.
rem This script must remain in a direct child folder of the repository root.
rem ============================================================

setlocal

rem Remove injected launch variables that can interfere with the pnpm shim.
set "NODE_OPTIONS="
set "CODEBUDDY_SESSION_ID="
set "CLAUDE_SESSION_ID="

rem Clear stale npm/npx injects inherited from a parent npm process.
for /f "delims==" %%V in ('set ^| findstr /b /i "NPM_ npm_config_ npm_execpath npm_command npm_lifecycle_ npm_package_json npm_node_execpath"') do set "%%V="

for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"
if not exist "%DSH_REPO%\package.json" goto :missingRepo
cd /d "%DSH_REPO%" || goto :failure

rem The out-of-tree plugins under _mytools\Plugins import
rem @deepseek-ai/schemastery from their own directory; link the vendored copy.
call "%~dp0ensure-plugin-modules.bat"

call :findPnpm
if not defined PNPM_CMD goto :missingPnpm
echo [build] Repository: %DSH_REPO%
echo [build] pnpm command: %PNPM_CMD%

rem Install first: `clean` and `build` both run workspace devDependencies
rem (tsx, typescript), which do not exist until this step has succeeded.
echo [build] Installing dependencies...
call "%PNPM_CMD%" install
if errorlevel 1 goto :failure

echo [build] Cleaning previous build outputs...
call "%PNPM_CMD%" run clean
if errorlevel 1 goto :failure

echo [build] Building DSH packages, CLI, and Web UI...
call "%PNPM_CMD%" run build
if errorlevel 1 goto :failure

rem start-dsh.bat launches these artifacts; a missing one breaks startup.
if not exist "%DSH_REPO%\apps\cli\lib\bin.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :missingArtifacts

echo.
echo [build] Verified apps\cli\lib\bin.js and apps\web\dist\index.html.
echo [build] Completed successfully. Now run start-dsh.bat.
pause
exit /b 0

:missingArtifacts
echo.
echo [build] The build reported success but the Web artifacts are missing:
echo [build]   apps\cli\lib\bin.js
echo [build]   apps\web\dist\index.html
pause
exit /b 1

:missingRepo
echo [build] Cannot find package.json relative to this script.
echo [build] Keep this file directly under the repository's _mytools folder.
pause
exit /b 1

:missingPnpm
echo [build] pnpm was not found on PATH, in the npm global directory, or under
echo [build] %USERPROFILE%\.workbuddy\binaries\node\versions.
echo [build] Install pnpm (or Node.js with Corepack) and try again.
pause
exit /b 1

:failure
set "BUILD_EXIT=%errorlevel%"
echo.
echo [build] Failed with exit code %BUILD_EXIT%.
pause
exit /b %BUILD_EXIT%

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
