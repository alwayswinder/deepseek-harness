@echo off
rem Compatibility entry point: the build used to live in two scripts, and this
rem name is what shortcuts, notes, and muscle memory point at. The Desktop build
rem is the full one (it contains the Web build), so this forwards there.
call "%~dp0build.bat" desktop %*
exit /b %errorlevel%
