' Runs bridge/index.mjs without a console window (used by the scheduled task). Same pattern as herk-edit-kit/scripts/drive-inbox-hidden.vbs.
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
stateDir = repo & "\bridge\.state"
If Not fso.FolderExists(stateDir) Then fso.CreateFolder(stateDir)
cmd = "cmd /c cd /d """ & repo & """ && node bridge\index.mjs >> """ & stateDir & "\bridge.log"" 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
