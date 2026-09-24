@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Refresh a profile's installed copy of the out-of-tree plugins that the
rem profile installs as `file:` directory dependencies.
rem
rem `pnpm add file:<dir>` copies the package into the profile once and records
rem no content hash, so an edit in Plugins\ afterwards reaches nothing: the
rem running host keeps loading the old host half and keeps serving the old
rem client bundle, and a pulled update looks like it never arrived. This step
rem runs on every launch, so the next start serves the current source.
rem
rem A plugin the profile installs as `link:` needs no step here - the profile
rem holds a junction to the source directory, so its files already are the
rem source files.
rem
rem %1 = profile name under the harness home (web, desktop).
rem Called by start-dsh.bat (web) and start-desktop.bat (desktop).
rem ============================================================

if "%~1"=="" (
    echo [plugins] sync-plugins.bat needs a profile name: web or desktop.
    exit /b 1
)

set "PROFILE_NAME=%~1"
if /i not "%PROFILE_NAME%"=="web" if /i not "%PROFILE_NAME%"=="desktop" (
    echo [plugins] Unknown profile "%PROFILE_NAME%"; expected web or desktop.
    exit /b 1
)

rem Resolve the _mytools root from this script's location.
for %%I in ("%~dp0..") do set "MYTOOLS_ROOT=%%~fI"

rem Resolve the harness home as the harness does: an unset or whitespace-only
rem DSH_HOME falls back to %USERPROFILE%\.dsh, and a leading ~ expands to the
rem user profile.
set "DSH_HOME_DIR="
for /f "tokens=*" %%A in ("%DSH_HOME%") do set "DSH_HOME_DIR=%%A"
if not defined DSH_HOME_DIR set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
if "%DSH_HOME_DIR:~0,1%"=="~" set "DSH_HOME_DIR=%USERPROFILE%%DSH_HOME_DIR:~1%"
for %%I in ("%DSH_HOME_DIR%") do set "DSH_HOME_DIR=%%~fI"

set "PROFILE_LOCAL=%DSH_HOME_DIR%\profiles\%PROFILE_NAME%\node_modules\@local"
set "PLUGIN_FAILED="

rem One call per plugin installed as a file: directory copy: its directory
rem under Plugins\, then its package name under @local. Add a line here when a
rem profile starts installing another such plugin.
call :syncPlugin appearance-plus dsh-appearance-plus
call :syncPlugin deepseek-usage dsh-deepseek-usage
call :syncPlugin dsh-fish-tank dsh-fish-tank

if defined PLUGIN_FAILED exit /b 1
exit /b 0

rem ============================================================
rem Copy one plugin's packaged files over the profile's installed copy.
rem %1 = plugin directory under Plugins\, %2 = package name under @local.
rem A profile that does not install this plugin is skipped, so one script
rem serves every profile. Sets PLUGIN_FAILED when a copy fails.
rem ============================================================
:syncPlugin
set "SYNC_SRC=%MYTOOLS_ROOT%\Plugins\%~1"
set "SYNC_DEST=%PROFILE_LOCAL%\%~2"
set "SYNC_CHANGED="

if not exist "%SYNC_SRC%\package.json" (
    echo [plugins] WARNING: %SYNC_SRC% is not a package; skipping its sync.
    set "PLUGIN_FAILED=1"
    goto :eof
)
if not exist "%SYNC_DEST%\package.json" goto :eof

for %%F in (index.js client.js cordis.patch.yml package.json README.md README.zh.md README.i18n.yaml bg.jpg) do (
    if exist "%SYNC_SRC%\%%F" (
        rem Comparing first keeps an unchanged plugin's timestamps alone, so a
        rem launch that changed nothing writes nothing.
        fc /b "%SYNC_SRC%\%%F" "%SYNC_DEST%\%%F" >nul 2>&1
        if errorlevel 1 (
            copy /y "%SYNC_SRC%\%%F" "%SYNC_DEST%\%%F" >nul
            if errorlevel 1 (
                echo [plugins] WARNING: could not refresh %SYNC_DEST%\%%F.
                set "PLUGIN_FAILED=1"
            ) else set "SYNC_CHANGED=1"
        )
    )
)

if defined SYNC_CHANGED echo [plugins] %~1: %PROFILE_NAME% profile copy refreshed from source.
goto :eof
