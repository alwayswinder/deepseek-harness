@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Back up this machine's DSH and Codex conversation records once, into
rem %DSH_BACKUP_DIR% (default D:\AI\备份). Called at startup by
rem build\start-desktop.bat, build\start-dsh.bat, and the pet's restart shim
rem settings\sync-pet-settings.mjs.
rem
rem A backup must never stand between a person and their app: a missing node, a
rem full destination, or a file the running app holds open is reported and the
rem launch continues. The worker (backup-chats.mjs) copies incrementally into one
rem snapshot per day, keeps the newest DSH_BACKUP_KEEP snapshots (default 14,
rem 0 = keep all), and never deletes anything at the source.
rem ============================================================

rem Resolve the harness home the way the harness does: a blank or whitespace-only
rem DSH_HOME falls back to %USERPROFILE%\.dsh, and a leading ~ is the user profile.
set "DSH_HOME_DIR="
for /f "tokens=*" %%A in ("%DSH_HOME%") do set "DSH_HOME_DIR=%%A"
if not defined DSH_HOME_DIR set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
if "%DSH_HOME_DIR:~0,1%"=="~" set "DSH_HOME_DIR=%USERPROFILE%%DSH_HOME_DIR:~1%"
for %%I in ("%DSH_HOME_DIR%") do set "DSH_HOME=%%~fI"

rem Locate node: PATH first, then the standard install directory, then the
rem WorkBuddy managed versions - the same order the launchers use.
set "BACKUP_NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined BACKUP_NODE set "BACKUP_NODE=%%N"
if not defined BACKUP_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "BACKUP_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined BACKUP_NODE (
    for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
        if not defined BACKUP_NODE if exist "%%D\node.exe" set "BACKUP_NODE=%%D\node.exe"
    )
)
if not defined BACKUP_NODE (
    echo [backup] WARNING: node was not found; skipped the conversation backup.
    exit /b 0
)

"%BACKUP_NODE%" "%~dp0backup-chats.mjs"
if errorlevel 1 echo [backup] WARNING: the conversation backup reported a failure; the launch continues.
exit /b 0