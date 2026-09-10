@echo off
chcp 65001 >nul

rem This script must remain in a direct child folder of the repository root.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"
cd /d "%DSH_REPO%" || goto :failure

echo [build] Cleaning previous build outputs...
call pnpm run clean
if errorlevel 1 goto :failure

echo [build] Installing dependencies...
call pnpm install
if errorlevel 1 goto :failure

echo [build] Building DSH...
call pnpm run build
if errorlevel 1 goto :failure

echo.
echo [build] Completed successfully.
pause
exit /b 0

:failure
set "BUILD_EXIT=%errorlevel%"
echo.
echo [build] Failed with exit code %BUILD_EXIT%.
pause
exit /b %BUILD_EXIT%
