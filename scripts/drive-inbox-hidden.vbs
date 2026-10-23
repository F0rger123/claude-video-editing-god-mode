' Runs scripts/drive-inbox.mjs without a console window. Used by the "Herk Edits Inbox" scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
kit = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir = kit & "\tmp\drive-inbox"
If Not fso.FolderExists(kit & "\tmp") Then fso.CreateFolder(kit & "\tmp")
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
cmd = "cmd /c cd /d """ & kit & """ && node scripts\drive-inbox.mjs >> """ & logDir & "\scheduler.log"" 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
