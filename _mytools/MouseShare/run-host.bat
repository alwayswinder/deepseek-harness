@echo off
chcp 65001 >nul
rem 主机端：在有物理键盘/鼠标的那台电脑上运行。
"%~dp0bin\MouseShare.exe" host %*
pause
