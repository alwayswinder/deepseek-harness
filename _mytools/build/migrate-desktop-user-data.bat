@echo off
rem Carry the Desktop profile's Electron browser data out of the build tree it
rem used to live in.
rem
rem The launcher passed --user-data-dir=apps\desktop\.desktop-build\development\
rem electron-user-data, and `pnpm run clean` deletes all of .desktop-build: every
rem full build threw away the cookies held by the Sidebar browser and by the
rem platform account view, so anything signed into there had to be signed into
rem again. start-desktop.bat now keeps that directory under the Harness home,
rem which no build touches; this script moves the data there so the move costs
rem one copy instead of one sign-in.
rem
rem Partitions holds one directory per Sidebar workspace and Local State holds
rem the key that decrypts the cookies inside them, so the two travel together.
rem
rem Runs only while the destination has no Partitions directory: once Electron
rem has created one there it holds storage of its own, and overwriting that
rem would be worse than not migrating. A copy that fails -- the previous
rem instance still holds its cookie database open -- is taken back out whole,
rem so the next launch retries from scratch instead of leaving half a profile
rem behind.
rem
rem Always exits 0: not migrating is never a reason to fail a launch.

setlocal
for %%I in ("%~dp0..\..") do set "MIGRATE_REPO=%%~fI"
set "MIGRATE_OLD=%MIGRATE_REPO%\apps\desktop\.desktop-build\development\electron-user-data"

rem The common case after one successful move is that the old tree is gone.
if not exist "%MIGRATE_OLD%\Partitions\" exit /b 0

set "MIGRATE_HOME="
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0resolve-dsh-home.ps1'; Resolve-DshHome"`) do set "MIGRATE_HOME=%%H"
if not defined MIGRATE_HOME exit /b 0

set "MIGRATE_NEW=%MIGRATE_HOME%\desktop\electron-user-data"
if exist "%MIGRATE_NEW%\Partitions\" exit /b 0

robocopy "%MIGRATE_OLD%\Partitions" "%MIGRATE_NEW%\Partitions" /E /COPY:DAT /DCOPY:DAT /R:0 /W:0 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :discard
copy /y "%MIGRATE_OLD%\Local State" "%MIGRATE_NEW%\Local State" >nul 2>&1
if errorlevel 1 goto :discard
echo [user-data] Moved the browser sign-ins to %MIGRATE_NEW%
exit /b 0

:discard
rem Nothing was carried over, so remove the incomplete copy; the next launch
rem tries again, when the previous instance no longer holds those files.
if exist "%MIGRATE_NEW%\Partitions\" rmdir /s /q "%MIGRATE_NEW%\Partitions"
exit /b 0
