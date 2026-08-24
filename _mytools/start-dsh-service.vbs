' Start the dsh web service as a hidden, independent process (no window).
' Usage: wscript start-dsh-service.vbs <exe> <args> <log-file> <work-dir>
'   exe      - full path to the command (e.g. pnpm.cmd)
'   args     - remaining arguments (e.g. dsh web --no-open)
'   log-file - output log path
'   work-dir - working directory (repository root)
' The service keeps running after this script exits.
' Stop it with stop-dsh.bat (kills the port process).
Option Explicit

Dim args, shell, cmdLine
Set args = WScript.Arguments
If args.Count < 4 Then
    WScript.Echo "usage: start-dsh-service.vbs <exe> <args> <log-file> <work-dir>"
    WScript.Quit 1
End If

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = args(3)

' The outer quotes keep cmd.exe from treating a quoted executable path as the
' end of its /c payload. Window style 0 is hidden; False detaches the service.
cmdLine = "cmd.exe /d /s /c """ & """" & args(0) & """ " & args(1) & " >> """ & args(2) & """ 2>&1"""
shell.Run cmdLine, 0, False

Set shell = Nothing
