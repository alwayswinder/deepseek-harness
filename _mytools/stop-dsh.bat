@echo off
setlocal
chcp 65001 >nul

rem Usage: stop-dsh.bat [port]   (default port 3080)

set PORT=3080
if not "%~1"=="" set PORT=%~1

echo Stopping DSH Web on port %PORT% ...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo   Killing PID %%a ...
    taskkill /f /t /pid %%a
)

if "%FOUND%"=="0" (
    echo   Nothing is listening on port %PORT%.
) else (
    echo Done. Port %PORT% should now be free.
)
pause
