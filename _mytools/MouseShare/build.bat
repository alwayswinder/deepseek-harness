@echo off
chcp 65001 >nul
setlocal
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" goto nocsc

pushd "%~dp0"
if not exist bin mkdir bin
"%CSC%" /nologo /optimize+ /platform:anycpu /target:exe /codepage:65001 /out:bin\MouseShare.exe src\Native.cs src\Host.cs src\Agent.cs src\Program.cs
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" goto failed
echo [ok] bin\MouseShare.exe
exit /b 0

:failed
echo [x] compile failed, exit code %RC%
exit /b %RC%

:nocsc
echo [x] csc.exe not found under %SystemRoot%\Microsoft.NET
exit /b 1
