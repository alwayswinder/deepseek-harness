@echo off
chcp 65001 >nul
setlocal
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" goto nocsc

pushd "%~dp0"
if not exist bin mkdir bin
"%CSC%" /nologo /optimize+ /platform:anycpu /target:exe /codepage:65001 /out:bin\MouseShare.exe src\Native.cs src\Status.cs src\Host.cs src\Agent.cs src\Program.cs
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" goto failed
rem 桌宠插件的「特殊功能 → 多机协同」跑的就是插件目录里这一份，编译后同步过去。
set "PLUGINBIN=%~dp0..\Plugins\dsh-littleIcon\bin"
if not exist "%PLUGINBIN%" mkdir "%PLUGINBIN%"
copy /y "%~dp0bin\MouseShare.exe" "%PLUGINBIN%\MouseShare.exe" >nul
if not "%ERRORLEVEL%"=="0" goto copyfailed
echo [ok] bin\MouseShare.exe  已同步到 Plugins\dsh-littleIcon\bin
exit /b 0

:copyfailed
echo [x] compiled, but copying the exe into the plugin failed
exit /b 1

:failed
echo [x] compile failed, exit code %RC%
exit /b %RC%

:nocsc
echo [x] csc.exe not found under %SystemRoot%\Microsoft.NET
exit /b 1
