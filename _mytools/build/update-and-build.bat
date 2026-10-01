@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem One-shot "update upstream + build" for this working copy.
rem
rem   update-and-build.bat                fetch the upstream remote, merge
rem                                       master, run preflight, then hand the
rem                                       build off (build.bat --detached --restart)
rem   update-and-build.bat --push         also push master to origin after merge
rem   update-and-build.bat --check        environment check only; changes nothing
rem   update-and-build.bat --no-pause     do not wait for a key at the end
rem   update-and-build.bat --help
rem
rem The upstream remote's name is per clone, so it is resolved instead of
rem assumed: `deepseek-ai` when it exists, otherwise `upstream`.
rem
rem Exit codes: 0 = handed off / check ok, 1 = failure, 2 = merge conflict
rem (aborted; resolve then rerun), 3 = preflight blocked, 4 = usage error.
rem ============================================================

for %%I in ("%~f0") do set "SCRIPT_PATH=%%~fI"
for %%I in ("%SCRIPT_PATH%") do set "SCRIPT_DIR=%%~dpI"
for %%I in ("%SCRIPT_DIR%..\..") do set "DSH_REPO=%%~fI"

set "MODE="
set "PUSH="
set "NOPAUSE="
set "USAGE_ERR="
:parseArgs
if "%~1"=="" goto :argsDone
if /i "%~1"=="--check" set "MODE=check" & shift & goto :parseArgs
if /i "%~1"=="--push" set "PUSH=1" & shift & goto :parseArgs
if /i "%~1"=="--no-pause" set "NOPAUSE=1" & shift & goto :parseArgs
if /i "%~1"=="--help" set "MODE=help" & shift & goto :parseArgs
if /i "%~1"=="-h" set "MODE=help" & shift & goto :parseArgs
echo [update] Unknown argument: %~1
set "USAGE_ERR=1"
goto :usage

:argsDone
if "%MODE%"=="help" goto :usage
if not exist "%DSH_REPO%\package.json" goto :missingRepo
cd /d "%DSH_REPO%" || goto :cantEnter

rem ---- environment ----------------------------------------------------------
git --version >nul 2>&1
if errorlevel 1 goto :noGit
rem The upstream remote is named per clone: this checkout calls it deepseek-ai,
rem another may call it upstream. Either is accepted; the name is resolved once
rem here and used for every fetch and merge below.
set "UPSTREAM_REMOTE=deepseek-ai"
git remote get-url deepseek-ai >nul 2>&1
if errorlevel 1 set "UPSTREAM_REMOTE=upstream"
git remote get-url %UPSTREAM_REMOTE% >nul 2>&1
if errorlevel 1 goto :noRemote
where node >nul 2>&1
if errorlevel 1 goto :noNode
where pnpm >nul 2>&1
if errorlevel 1 goto :noPnpm

set "DIRTY=0"
for /f "delims=" %%L in ('git status --porcelain ^| findstr /v /b "??"') do set "DIRTY=1"
if exist "%DSH_REPO%\.git\MERGE_HEAD" goto :mergeInProgress

if "%MODE%"=="check" goto :checkEnv

rem ---- update -----------------------------------------------------------------
if "%DIRTY%"=="1" goto :dirtyTree

echo [update] Fetching upstream %UPSTREAM_REMOTE%...
git fetch %UPSTREAM_REMOTE%
if errorlevel 1 goto :fetchFailed

for /f "delims=" %%R in ('git rev-parse HEAD') do set "HEAD_BEFORE=%%R"

echo [update] Merging %UPSTREAM_REMOTE%/master...
git merge --no-edit %UPSTREAM_REMOTE%/master
if errorlevel 1 goto :mergeConflict

for /f "delims=" %%R in ('git rev-parse HEAD') do set "HEAD_AFTER=%%R"

if "%HEAD_BEFORE%"=="%HEAD_AFTER%" (
    echo [update] Already up to date; nothing new to merge.
    goto :done
)

echo [update] HEAD: %HEAD_BEFORE% -^> %HEAD_AFTER%

if defined PUSH (
    echo [update] Pushing master to origin...
    git push origin master
    if errorlevel 1 (
        echo [update] Push failed but the local merge is done; continuing to build.
    )
)

rem ---- preflight ----------------------------------------------------------------
echo [update] Running the preflight check...
node "%SCRIPT_DIR%preflight.mjs" --mode desktop
if errorlevel 2 goto :preflightBlocked
if errorlevel 1 echo [update] Preflight could not run; continuing without it.

rem ---- resume plan + detached build ---------------------------------------------
for /f "delims=" %%L in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%write-resume-plan.ps1" -Repo "%DSH_REPO%" -Revision "%HEAD_AFTER%"') do set "LOG_PATH=%%L"
if not defined LOG_PATH goto :noPlan

echo [update] Resume plan written to ^$DSH_HOME\build\resume-plan.json.
echo [update] Build log: %LOG_PATH%

call "%SCRIPT_DIR%build.bat" --detached --restart --log "%LOG_PATH%"
if errorlevel 1 goto :handoffFailed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%write-resume-plan.ps1" -Repo "%DSH_REPO%" -Revision "%HEAD_AFTER%" -State launched -LogPath "%LOG_PATH%" >nul 2>&1

echo.
echo [update] Build handed off ^(detached^). This app closes while it builds and
echo [update] comes back on success. Results land in last-build.json and the
echo [update] log above; a later turn reads them there.
goto :done

rem ---- branches -------------------------------------------------------------------
:checkEnv
echo [update] Environment check:
echo [update]   git:          OK
echo [update]   upstream:     %UPSTREAM_REMOTE%
if "%DIRTY%"=="0" (
    echo [update]   working tree: clean
) else (
    echo [update]   working tree: has uncommitted changes
)
echo [update]   node:         OK
echo [update]   pnpm:         OK
echo [update]   merge pending: no
exit /b 0

:done
if not defined NOPAUSE pause
exit /b 0

:usage
echo Usage: update-and-build.bat [--check ^| --push ^| --no-pause ^| --help]
echo   --check    environment check only, changes nothing
echo   --push     also push master to origin after the merge
echo   --no-pause do not wait for a key at the end
if not defined USAGE_ERR exit /b 0
exit /b 4

:missingRepo
echo [update] Cannot find package.json relative to this script.
echo [update] Keep this file in the repository's _mytools\build folder.
if not defined NOPAUSE pause
exit /b 1

:cantEnter
echo [update] Cannot enter the repository directory.
if not defined NOPAUSE pause
exit /b 1

:noGit
echo [update] git was not found on PATH.
if not defined NOPAUSE pause
exit /b 1

:noRemote
echo [update] Neither upstream remote 'deepseek-ai' nor 'upstream' is configured.
echo [update] Add one once, then rerun:
echo [update]   git remote add upstream git@github.com:deepseek-ai/deepseek-harness.git
if not defined NOPAUSE pause
exit /b 1

:noNode
echo [update] node was not found on PATH (needed for preflight and the build).
if not defined NOPAUSE pause
exit /b 1

:noPnpm
echo [update] pnpm was not found (needed by the build).
if not defined NOPAUSE pause
exit /b 1

:mergeInProgress
echo [update] A merge is already in progress; finish or abort it first, then rerun.
if not defined NOPAUSE pause
exit /b 1

:dirtyTree
echo [update] The working tree has uncommitted changes; merge refuses to run.
git status --short
echo [update] Commit or stash them first, then rerun.
if not defined NOPAUSE pause
exit /b 1

:fetchFailed
echo [update] git fetch failed; check the network or SSH key, then rerun.
if not defined NOPAUSE pause
exit /b 1

:mergeConflict
echo [update] The merge hit conflicts; it has been aborted, nothing changed.
git merge --abort
git status --short
echo [update] Resolve the conflict, finish the merge, then rerun this script.
if not defined NOPAUSE pause
exit /b 2

:preflightBlocked
echo [update] Preflight found a blocking problem; nothing was destroyed.
echo [update] Fix what it names, then rerun.
if not defined NOPAUSE pause
exit /b 3

:noPlan
echo [update] Failed to write the resume plan; no build was started.
if not defined NOPAUSE pause
exit /b 1

:handoffFailed
echo [update] The detached build failed to start; see the message above.
if not defined NOPAUSE pause
exit /b 1