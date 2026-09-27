' Hidden launcher behind the Start Menu and desktop shortcuts.
'
' start-desktop.bat checks the prepared app, refreshes the profile's plugin
' copies, and hands Electron to a detached helper; it prints a line or two and
' exits. Run straight from a shortcut that would flash a console window for no
' reason, so this runs it hidden - and keeps the failure visible instead:
' everything the launcher writes goes to a log under %TEMP%, and a non-zero exit
' raises a message box with the tail of that log.

Option Explicit

Const LOG_NAME = "dsh-desktop-launch.log"
Const TAIL_CHARS = 1200

Dim shell, fso, here, repo, bat, logPath, command, code
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)          ' _mytools\build
repo = fso.GetParentFolderName(fso.GetParentFolderName(here))   ' repository root
bat = fso.BuildPath(repo, "_mytools\start-desktop.bat")
logPath = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), LOG_NAME)

If Not fso.FileExists(bat) Then
    MsgBox "Cannot find the launcher:" & vbCrLf & bat, vbCritical, "DeepSeek Harness"
    WScript.Quit 1
End If

' DSH_NO_PAUSE keeps the launcher's own failure pauses out of the hidden console,
' which would otherwise wait for a key nobody can press.
command = "cmd.exe /c ""set DSH_NO_PAUSE=1&& """ & bat & """ > """ & logPath & """ 2>&1"""
code = shell.Run(command, 0, True)

If code <> 0 Then
    MsgBox "DeepSeek Harness did not start (exit code " & code & ")." & vbCrLf & vbCrLf & _
           Tail(logPath) & vbCrLf & "Full log: " & logPath, vbCritical, "DeepSeek Harness"
End If
WScript.Quit code

' The last part of a log file, capped so a long failure cannot fill the screen.
Function Tail(path)
    Dim stream, text
    Tail = "(no output was written)"
    If Not fso.FileExists(path) Then Exit Function
    On Error Resume Next
    Set stream = fso.OpenTextFile(path, 1)
    If Err.Number <> 0 Then Exit Function
    text = stream.ReadAll
    stream.Close
    On Error Goto 0
    If Len(text) > TAIL_CHARS Then text = "..." & Right(text, TAIL_CHARS)
    Tail = Trim(text)
End Function
