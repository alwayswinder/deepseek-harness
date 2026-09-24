@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Turn a Tonghuashun ledger export into the position snapshot this plugin
rem reads. It sits beside that snapshot, so this directory holds everything the
rem plugin needs: the code, the data, and the tool that rewrites the data.
rem
rem Usage: drag the exported .xlsx onto this file, or run
rem   ths-export-positions.bat "C:\path\to\export.xlsx"
rem
rem Output: positions.json next to this script - the one file the plugin reads.
rem Trade again? Export a fresh sheet and run this again; the strip picks the new
rem positions up on its next refresh, with no restart.
rem ============================================================

if "%~1"=="" (
    echo Usage: drag an exported .xlsx onto this file, or run
    echo   %~nx0 "C:\path\to\export.xlsx"
    pause
    exit /b 1
)
if not exist "%~f1" (
    echo [positions] Input file not found: %~f1
    pause
    exit /b 1
)
if /i not "%~x1"==".xlsx" (
    echo [positions] Input must be an .xlsx workbook: %~f1
    pause
    exit /b 1
)

rem Pick a Python that can import openpyxl: the Desktop runtime ships one, while
rem a machine's own Python usually does not have it. The wildcard sits in the
rem last path component because cmd cannot expand one in the middle, and every
rem candidate proves itself by importing the library.
set "PYTHON_CMD="
for %%I in ("%~dp0..\..\..") do set "DSH_REPO=%%~fI"
set "DSH_HOME_DIR="
for /f "tokens=*" %%A in ("%DSH_HOME%") do set "DSH_HOME_DIR=%%A"
if not defined DSH_HOME_DIR set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
if "%DSH_HOME_DIR:~0,1%"=="~" set "DSH_HOME_DIR=%USERPROFILE%%DSH_HOME_DIR:~1%"
for %%I in ("%DSH_HOME_DIR%") do set "DSH_HOME_DIR=%%~fI"
call :tryPython "%DSH_REPO%\apps\desktop\.desktop-build\targets\win-x64\runtime\primary-runtime\dependencies\python\python.exe"
for /d %%R in ("%DSH_HOME_DIR%\dsh-runtimes\*") do call :tryPython "%%R\dependencies\python\python.exe"
call :tryPython python
call :tryPython py
if not defined PYTHON_CMD (
    echo [positions] No Python with openpyxl was found.
    echo [positions] Run "pip install openpyxl" for one, or run this conversion
    echo [positions] on a machine whose DSH Desktop runtime ships that library.
    pause
    exit /b 1
)

echo [positions] Converting %~nx1 ...
"%PYTHON_CMD%" "%~dp0ths-export-positions.py" "%~f1"
set "POSITIONS_EXIT=%errorlevel%"

if not "%POSITIONS_EXIT%"=="0" (
    echo [positions] Conversion failed with exit code %POSITIONS_EXIT%.
    pause
    exit /b %POSITIONS_EXIT%
)

echo [positions] Done. The strip picks this up on its next refresh.
pause
exit /b 0

rem ============================================================
rem Adopt the first candidate that imports openpyxl.
rem %1 = interpreter name on PATH, or a full path to python.exe.
rem A missing candidate fails its own probe, so no existence test is needed.
rem ============================================================
:tryPython
if defined PYTHON_CMD goto :eof
"%~1" -c "import openpyxl" >nul 2>&1
if errorlevel 1 goto :eof
set "PYTHON_CMD=%~1"
goto :eof
