# Registers the "God Mode Cut Bridge" scheduled task (every 5 minutes, hidden window).
# Run once from the repo root in PowerShell:  powershell -ExecutionPolicy Bypass -File bridge\install-task.ps1
# Remove later with:                          Unregister-ScheduledTask -TaskName "God Mode Cut Bridge"
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $PSScriptRoot "run-hidden.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "God Mode Cut Bridge" -Action $action -Trigger $trigger -Settings $settings -Description "Connects the God Mode Cut app to the Herk Edit Kit Drive pipeline." -Force | Out-Null
# "Content ideas" watcher: one small process that stays running and picks up requests within seconds.
# Started at sign-in and re-checked every 5 minutes (if it is already running, nothing happens).
$ideasVbs = Join-Path $PSScriptRoot "run-ideas-hidden.vbs"
$ideasAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$ideasVbs`"" -WorkingDirectory $repo
$ideasTriggers = @(
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))
)
$ideasSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName "God Mode Cut Ideas" -Action $ideasAction -Trigger $ideasTriggers -Settings $ideasSettings -Description "Writes requested content ideas for the God Mode Cut app within seconds." -Force | Out-Null
Write-Host "Scheduled: God Mode Cut Bridge (every 5 minutes) and the Ideas watcher. Logs: bridge\.state\"
