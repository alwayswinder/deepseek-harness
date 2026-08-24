' Start DSH Web with a visible status window (double-click this file).
' The status window can be closed without stopping the service.
' Log: dsh-web.log in the same folder. Stop it with stop-dsh.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run """" & scriptDir & "\start-dsh.bat""", 1, False
Set shell = Nothing
Set fso = Nothing
