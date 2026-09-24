' Start a dsh service as a hidden, independent process (no window).
' Usage: wscript start-dsh-service.vbs <log-file> <work-dir> <exe> [arg ...]
'   log-file - stdout/stderr log path; appended for the life of the service
'   work-dir - working directory (repository root)
'   exe      - full path of the program to run (node.exe, dsh.cmd, electron.exe)
'   arg ...  - further arguments; each one is quoted separately so paths that
'              contain spaces survive cmd.exe parsing
' The service keeps running after this script exits.
' Stop the Web service with stop-dsh.bat [port]; the Desktop app closes with
' its window.
Option Explicit

Dim args, shell, cmdLine, index
Set args = WScript.Arguments
If args.Count < 3 Then
    WScript.Echo "usage: start-dsh-service.vbs <log-file> <work-dir> <exe> [arg ...]"
    WScript.Quit 1
End If

cmdLine = ""
For index = 2 To args.Count - 1
    If index > 2 Then cmdLine = cmdLine & " "
    cmdLine = cmdLine & """" & args(index) & """"
Next

Set shell = CreateObject("WScript.Shell")
' The working directory anchors relative paths (the built CLI entry).
shell.CurrentDirectory = args(1)

' The outer quotes keep cmd.exe from treating a quoted executable path as the
' end of its /c payload. Window style 0 is hidden; False detaches the service.
shell.Run "cmd.exe /d /s /c """ & cmdLine & " >> """ & args(0) & """ 2>&1""", 0, False

Set shell = Nothing
