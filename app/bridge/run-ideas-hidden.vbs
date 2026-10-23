' Runs the 1-minute "Content ideas" pass of the bridge without a console window.
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
stateDir = repo & "\bridge\.state"
If Not fso.FolderExists(stateDir) Then fso.CreateFolder(stateDir)
cmd = "cmd /c cd /d """ & repo & """ && node bridge\index.mjs --watch >> """ & stateDir & "\ideas.log"" 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
