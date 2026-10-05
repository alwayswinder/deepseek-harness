@echo off
chcp 65001 >nul
rem 被控端：在另一台电脑上运行。第一个参数是主机端地址，留空会提示输入。
set "SERVER=%~1"
if not "%SERVER%"=="" goto run
<nul set /p "=请输入主机端地址（形如 192.168.1.3:15180）: "
set /p SERVER=
:run
if "%SERVER%"=="" goto empty
"%~dp0bin\MouseShare.exe" agent --server %SERVER%
pause
exit /b 0

:empty
echo [x] 没有填写主机端地址
pause
exit /b 1
