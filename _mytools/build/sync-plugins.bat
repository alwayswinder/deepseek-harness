@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem Make sure a profile serves the current source of the out-of-tree plugins
rem under Plugins\.
rem
rem How the profile installs a plugin decides whether there is anything to do:
rem
rem   link:  the profile keeps a junction to the plugin's source directory, so
rem          the files it loads already are the source files; an edit is live as
rem          soon as the half that reads it restarts. Nothing is copied here.
rem   file:  the profile holds a real copy, and `pnpm add file:<dir>` records no
rem          content hash for it, so an edit in Plugins\ afterwards reaches
rem          nothing: the running host keeps loading the old host half and keeps
rem          serving the old client bundle, and a pulled update looks like it
rem          never arrived. Only that copy is refreshed here.
rem
rem Every plugin under Plugins\ is installed with link: today, so on this machine
rem the copy branch normally does nothing. It stays because the linkage is
rem measured per plugin instead of assumed: a machine or a profile that installs
rem copies still gets its files refreshed on every launch.
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

rem One call per plugin shipped from this tree: its directory under Plugins\,
rem then its package name under @local. Add a line here when another plugin
rem moves into Plugins\.
call :syncPlugin appearance-plus dsh-appearance-plus
call :syncPlugin deepseek-usage dsh-deepseek-usage
call :syncPlugin dsh-fish-tank dsh-fish-tank
call :syncPlugin dsh-aquarium3d dsh-aquarium3d
call :syncPlugin dsh-littleIcon dsh-little-icon

if defined PLUGIN_FAILED exit /b 1
exit /b 0

rem ============================================================
rem Refresh one plugin's installed copy, when the profile holds a copy at all.
rem %1 = plugin directory under Plugins\, %2 = package name under @local.
rem A profile that does not install this plugin is skipped, so one script serves
rem every profile. Sets PLUGIN_FAILED when a copy fails.
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

rem A junction or symlink means this profile reads the source directory itself,
rem so the files are already current. cmd reports a reparse point as the `l`
rem attribute, which is why no extra command is needed to measure it.
set "SYNC_ATTR="
for %%A in ("%SYNC_DEST%") do set "SYNC_ATTR=%%~aA"
if not "%SYNC_ATTR:l=%"=="%SYNC_ATTR%" goto :eof

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

rem Directories a plugin ships beside those files (桌宠的素材与脚本、鱼缸的
rem src\ 与 vendor\) are mirrored, because the copy above only ever covers single
rem files. robocopy reports 0-7 on success and >=8 on failure; it skips identical
rem files, so this stays cheap.
for %%D in (assets pet locale src vendor tools) do (
    if exist "%SYNC_SRC%\%%D" (
        robocopy "%SYNC_SRC%\%%D" "%SYNC_DEST%\%%D" /E /NJH /NJS /NP /NDL /R:0 /W:0 >nul
        if errorlevel 8 (
            echo [plugins] WARNING: could not refresh %SYNC_DEST%\%%D.
            set "PLUGIN_FAILED=1"
        )
    )
)

if defined SYNC_CHANGED echo [plugins] %~1: %PROFILE_NAME% profile copy refreshed from source.
goto :eof
