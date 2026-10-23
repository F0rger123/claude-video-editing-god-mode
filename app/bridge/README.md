# Editor bridge

Connects the app to the **existing** Herk Edit Kit pipeline on the editing PC. It does not edit
video and does not change `herk-edit-kit`. It only reads and writes the editor's own folders
(`HERK_DRIVE_ROOT`, now the local folder `C:\Video Inbox`; no Google Drive) and its
`tmp/drive-inbox/state.json`. Contract: [docs/EDITOR-INTEGRATION.md](../docs/EDITOR-INTEGRATION.md).

## Setup (once, on the editing PC)

1. `npm ci` in this repo.
2. Create `bridge/.env` (never committed):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   APP_URL=https://<your deployed app>
   CRON_SECRET=<same value as the Worker secret>
   # Optional — defaults shown
   HERK_KIT=<repo root>
   # HERK_DRIVE_ROOT and HERK_NTFY_TOPIC are read from herk-edit-kit/.env when not set here
   BRIDGE_MAX_WAITING=2      # jobs handed to the editor but not started yet
   BRIDGE_CAPTIONS=1         # write captions with Claude Code (subscription, no paid API)
   BRIDGE_IMPORT_DRIVE=1     # show edits made by dropping clips straight into Drive
   ```

3. Try one pass without changing anything: `npm run bridge:dry`
4. Run it for real once: `npm run bridge`
5. Schedule it every 5 minutes:

   ```
   powershell -ExecutionPolicy Bypass -File bridge\install-task.ps1
   ```

Keep the existing **Herk Edits Inbox** task as it is. The bridge also starts `drive-inbox.mjs` right
away when work is waiting (the editor's own lock prevents two runs at once).

## What each pass does

1. Heartbeat to the app (Settings shows "Connected" and the Drive root).
2. Creates a Drive brand folder per client and writes `About this brand.txt` from the brand profile,
   only if the file is missing, still the blank template, or was written by the bridge.
3. Hands **Queued** jobs to the editor: main take into `2 Upload Raw/Short-form|Long-form/`, other
   takes / B-roll / photos / references into `2 Upload Raw/Job files/<clip>/`, instructions into
   `<clip>.txt`. Priority order; at most `BRIDGE_MAX_WAITING` waiting at a time.
4. Sends **Needs changes** to the editor's `4 Rate/Try again/` with the structured note.
5. Mirrors editor progress: Editing → Rendering → V1/V2… uploaded to the app → Review.
   Failures after the editor's 2 attempts → Failed (retry from the app).
6. Copies approved / rejected options into `4 Rate/Yes|No` so the editor keeps learning the brand.
7. Imports edits made the old way (straight into Drive) so the calendar stays complete.
8. Mirrors important alerts to your ntfy topic.

Log: `bridge/.state/bridge.log`. State: `bridge/.state/state.json`.
