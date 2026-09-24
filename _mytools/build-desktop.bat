@echo off
setlocal
chcp 65001 >nul

rem Build the DSH Electron desktop app without launching it.
rem Steps: dependencies, the Web build that the Desktop host serves, the
rem Electron shell, and the prepared development runtime that start-desktop.bat
rem loads.
rem Preparing that runtime downloads a pinned Node and Python runtime from
rem GitHub and PyPI, so this script needs direct or proxied network access; it
rem fails before writing the project when the download is unreachable.
rem This script must remain in a direct child folder of the repository root.

rem Remove injected launch variables that can interfere with the pnpm shim.
set "NODE_OPTIONS="
set "CODEBUDDY_SESSION_ID="
set "CLAUDE_SESSION_ID="
for /f "delims==" %%V in ('set ^| findstr /b /i "NPM_ npm_config_ npm_execpath npm_command npm_lifecycle_ npm_package_json npm_node_execpath"') do set "%%V="

rem Resolve the repository root from this script's location.
for %%I in ("%~dp0..") do set "DSH_REPO=%%~fI"
if not exist "%DSH_REPO%\apps\desktop\package.json" goto :missingRepo
cd /d "%DSH_REPO%" || goto :failure

rem The out-of-tree plugins under _mytools\Plugins need two setup steps: link
rem the peer packages they import from their own directory, and build the ones
rem that ship sources instead of built files. Both steps are idempotent.
call "%~dp0build\ensure-plugin-modules.bat"
if errorlevel 1 goto :pluginFailure

rem Locate pnpm; Explorer launches may have a different PATH.
where pnpm >nul 2>&1
if not errorlevel 1 (
    set "PNPM_CMD=pnpm.cmd"
    goto :pnpmReady
)
if exist "%APPDATA%\npm\pnpm.cmd" (
    set "PNPM_CMD=%APPDATA%\npm\pnpm.cmd"
    goto :pnpmReady
)
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\pnpm.cmd" (
        set "PNPM_CMD=%%D\pnpm.cmd"
        goto :pnpmReady
    )
)
if exist "%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd" (
    set "PNPM_CMD=%DSH_REPO%\.pnpm-tools\node_modules\.bin\pnpm.cmd"
    goto :pnpmReady
)
goto :missingPnpm

:pnpmReady
echo [desktop build] Repository: %DSH_REPO%
echo [desktop build] pnpm command: %PNPM_CMD%

call "%~dp0build\ensure-plugin-builds.bat" "%PNPM_CMD%"
if errorlevel 1 goto :pluginFailure

if not exist "%DSH_REPO%\node_modules\.pnpm\node_modules" goto :install
echo [desktop build] Checking pnpm workspace links...
set "PNPM_LINK_ROOT=%DSH_REPO%\node_modules\.pnpm\node_modules"
for /d %%D in ("%PNPM_LINK_ROOT%\*") do (
    call :removeBrokenPnpmLink "%%~fD"
    if errorlevel 1 goto :failure
)
for /d %%S in ("%PNPM_LINK_ROOT%\@*") do (
    for /d %%D in ("%%~fS\*") do (
        call :removeBrokenPnpmLink "%%~fD"
        if errorlevel 1 goto :failure
    )
)

:install
echo [desktop build] Synchronizing dependencies...
call "%PNPM_CMD%" install
if errorlevel 1 goto :failure

rem A running development Desktop keeps desktop.log open, which makes clean
rem fail on Windows. Stop only Electron instances owned by this checkout.
call :stopRepositoryDesktop
if errorlevel 1 goto :failure

echo [desktop build] Cleaning previous build outputs...
call "%PNPM_CMD%" run clean
if errorlevel 1 goto :failure

echo [desktop build] Building DSH packages...
call "%PNPM_CMD%" run build
if errorlevel 1 goto :failure

echo [desktop build] Building the Electron shell...
call "%PNPM_CMD%" run build:desktop
if errorlevel 1 goto :failure

echo [desktop build] Preparing the development project and bundled runtime...
call "%PNPM_CMD%" exec tsx "%~dp0build\prepare-desktop.ts"
if errorlevel 1 goto :failure

rem start-desktop.bat loads these outputs directly. Validate all cross-package
rem entries so a successful root command cannot leave a partial Desktop build.
if not exist "%DSH_REPO%\apps\cli\lib\bin.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\cli\lib\profile-boot.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\web\dist\index.html" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\desktop\lib\main.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\desktop-host\lib\index.js" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\desktop\node_modules\electron\dist\electron.exe" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\desktop\.desktop-build\development\project\desktop-runtime.json" goto :missingArtifacts
if not exist "%DSH_REPO%\apps\desktop\.desktop-build\targets\win-x64\runtime\primary-runtime\runtime.json" goto :missingArtifacts

for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "BUILD_REVISION=%%H"
if not defined BUILD_REVISION goto :missingGitRevision
> "%DSH_REPO%\apps\web\dist\.dsh-build-revision" echo %BUILD_REVISION%
if not exist "%DSH_REPO%\apps\desktop\.desktop-build\development" mkdir "%DSH_REPO%\apps\desktop\.desktop-build\development"
> "%DSH_REPO%\apps\desktop\.desktop-build\development\build-revision.txt" echo %BUILD_REVISION%

echo.
echo [desktop build] Completed successfully.
echo [desktop build] Run start-desktop.bat to launch the app.
pause
exit /b 0

:removeBrokenPnpmLink
fsutil reparsepoint query "%~1" >nul 2>&1 || exit /b 0
if exist "%~1\" exit /b 0
echo [desktop build] Removing stale dependency link: %~1
rmdir "%~1"
exit /b %errorlevel%

:stopRepositoryDesktop
if not exist "%DSH_REPO%\apps\desktop\node_modules\electron\dist\electron.exe" exit /b 0
powershell.exe -NoProfile -Command "$target = [IO.Path]::GetFullPath((Join-Path $env:DSH_REPO 'apps\desktop\node_modules\electron\dist\electron.exe')); $processes = @(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target }); if ($processes.Count -gt 0) { Write-Host '[desktop build] Stopping the running Desktop instance before cleaning...'; $processes | Stop-Process -Force -ErrorAction Stop }"
exit /b %errorlevel%

:missingRepo
echo [desktop build] Cannot find apps\desktop\package.json relative to this script.
echo [desktop build] Keep this file directly under the repository's _mytools folder.
pause
exit /b 1

:missingPnpm
echo [desktop build] pnpm was not found.
echo [desktop build] Install pnpm and try again.
pause
exit /b 1

:missingGitRevision
echo [desktop build] Cannot read the current Git revision.
pause
exit /b 1

:missingArtifacts
echo.
echo [desktop build] The build reported success but a required Desktop artifact is missing.
echo [desktop build] Required outputs include CLI profile boot, Web assets, Electron,
echo [desktop build] Desktop Host, the development descriptor, and the primary runtime.
echo [desktop build] Check the build output above, then run this script again.
pause
exit /b 1

:pluginFailure
echo.
echo [desktop build] The out-of-tree plugin setup failed. See the [plugins] message above.
pause
exit /b 1

:failure
set "DESKTOP_EXIT=%errorlevel%"
echo.
echo [desktop build] Failed with exit code %DESKTOP_EXIT%.
pause
exit /b %DESKTOP_EXIT%
