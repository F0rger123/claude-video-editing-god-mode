# Existing editor: inspection and integration contract

Inspected on 2026-10-23. The editor is **not** part of this repository and is **not**
replaced. This document records how it works today and the exact, minimal contract the
Content PWA uses to drive it.

## What the editor is

`<repo root>` — the Herk Edit Kit (clone of
`nateherkai/herk-edit-kit`, with local additions). It is a Claude Code / Codex workspace:

| Part | Role |
| --- | --- |
| `.claude/skills/*` (15 skills) | `short-form-edit` (9:16 reels), `edit-video` (16:9 long-form), `cut-silences`, `cut-mistakes`, `video-storytelling`, `hyperframes*`, `gsap`, `style-library`, `motion-showreel`, … |
| HyperFrames 0.7.109 + GSAP 3.14.2 | HTML compositions rendered to MP4 (`npx hyperframes render`) through headless Chrome + FFmpeg |
| `scripts/transcribe-local.mjs` | whisper.cpp (CUDA, RTX 5070, `medium.en`), output in the ElevenLabs word format the cutting tools expect |
| `scripts/matte-rvm.py` | Robust Video Matting for head pop-outs |
| `scripts/preflight.mjs`, validators | Structural checks before render |
| `CLAUDE.md` / `CLAUDE.local.md` | House style and owner rules: motion-graphics B-roll for every point, film burns from the CapCut pack, owner SFX pack, **no music**, **free local tools only, no paid APIs** |
| `style-library/`, `style-templates/` | 406 motion cards and scene templates |
| `raw-media/styles/<brand-slug>/` | Per-brand taste: `inspiration.md`, `ratings.json`, optional locked `captions.md`/`captions.css` |

Open-source dependencies: HyperFrames, GSAP, Playwright, FFmpeg/ffprobe, whisper.cpp,
Robust Video Matting, yt-dlp (inspiration downloads), Node 22+.

## How it receives work today: `scripts/drive-inbox.mjs`

A phone-to-PC pipeline on Google Drive for desktop. Windows Task Scheduler task
**"Herk Edits Inbox"** runs `scripts/drive-inbox-hidden.vbs` → `node scripts/drive-inbox.mjs`
every 15 minutes. Each run does **at most one job**.

Root: `HERK_DRIVE_ROOT` (default `G:\My Drive\Claude Video Edits`). Every top-level folder
except `In Progress`, `Paused`, `Sound effects` is a **brand** (today: `Studio HQ`,
`Real Estate`). Per brand:

```
<Brand>/About this brand.txt        brand profile read by every edit
<Brand>/1 Inspiration/              reference reels/screens + "Reel links and ideas.txt"
<Brand>/2 Upload Raw/Short-form/    raw clip -> 9:16 reel   (optional "<clip>.txt" note)
<Brand>/2 Upload Raw/Long-form/     raw clip -> 16:9 video  (optional "<clip>.txt" note)
<Brand>/3 Finished/<clip>/          "<clip> - Option A.mp4" … + "About these options.txt"
<Brand>/4 Rate/Yes|Maybe|No/        rating teaches the brand's taste (ratings.json)
<Brand>/4 Rate/Try again/           option + "<option name>.txt" note -> new version
<Brand>/5 Archive/                  raw clip after its edit is made
In Progress/                        the clip being edited now (shared)
Paused/                             waiting for Claude (usage limit / sign-in)
Sound effects/                      owner SFX pack (shared)
```

Job order per run: resume paused → per brand: new inspiration → new raw clip (only after
its size is stable across two runs) → try-again request. Ratings are recorded every run
without Claude.

Edit run: copies the raw clip into `video-projects/<brand>-reel-<clip>-<date>/raw/`, then
`claude -p --permission-mode acceptEdits --add-dir <Drive root>` with a prompt built from
the skill (`short-form-edit` or `edit-video`), the clip's `.txt` note, brand context and
unattended-run rules. Claude must end with `OPTION A: <abs mp4> | <description>` lines;
those MP4s are copied into `3 Finished/<clip>/`. `HERK_OPTIONS` (1–6, currently 1) sets
the option count.

State: `tmp/drive-inbox/state.json`

| Key | Meaning |
| --- | --- |
| `jobs[<abs raw path>]` | `{status: running|done|failed|waiting, attempts, project, started, finished}` |
| `jobs["again:<path>:<mtime>"]` | try-again runs |
| `outputs["<clip> - Option X.mp4"]` | `{brand, clip, project, option, description}` |
| `parked`, `paused`, `sizes`, `rated`, `inspoHash` | resume, limit/auth pause, upload stability, ratings, inspiration |

Failures: 2 attempts, then the clip returns to its upload folder. Usage-limit / auth
blocks park the clip in `Paused/` and do not consume an attempt. Logs:
`tmp/drive-inbox/logs/<stamp>.log`. Phone alerts: ntfy (`HERK_NTFY_TOPIC`).

Rendering: inside the Claude run, HyperFrames renders to
`video-projects/<project>/renders/*.mp4`.

## No Google Drive needed (2026-10-23)

Drive was only how the phone got files to the PC. The app now does that, so `HERK_DRIVE_ROOT` in
`herk-edit-kit/.env` points at a plain local folder: `C:\Video Inbox`. The editor code is
unchanged; it reads the same folder layout from there. The old Drive folder is untouched (backup at
`herk-edit-kit/.env.bak-before-local-root`). `Sound effects/` in the new folder holds the owner's SFX pack.
The editor's ntfy alerts link to Drive only when Drive for desktop has the file; otherwise they fall back to a
search link, and the app's own notifications carry the real links.

## Integration contract (what the bridge does)

The PWA never talks to the editor directly. `bridge/` (in this repo) runs on the same PC
and speaks **only the editor's existing folder protocol**:

| PWA event | Bridge action in the existing folders |
| --- | --- |
| Job reaches `Queued` | Download job media from Supabase Storage. Primary clip → `<Brand>/2 Upload Raw/<Short-form|Long-form>/<clip>.<ext>`; all other takes, B-roll, photos, references → `<Brand>/2 Upload Raw/Job files/<clip>/`; structured instructions → `<clip>.txt` (the note the editor already reads). Then starts `drive-inbox.mjs` once (its lock prevents overlap) instead of waiting up to 15 minutes. |
| Editor running | `state.jobs[path].status=running` / file in `In Progress` → `Editing`; a new MP4 in `video-projects/<project>/renders/` → `Rendering`; `Paused/` → `Editing` with a "paused: usage limit" flag. |
| Editor done | New `state.outputs` entries for the clip → upload MP4 to Storage as version V(n) → `Review`. |
| Editor failed (attempts ≥ 2) | `Failed` + notification + retry button. Retry clears the bridge mapping and re-drops the clip. |
| Needs changes | Copy `3 Finished/<clip>/<clip> - Option X.mp4` into `4 Rate/Try again/` with `<clip> - Option X.txt` = structured feedback. The editor's own try-again flow makes the next option letter, which becomes V(n+1). |
| Approved / Rejected | Copy the option into `4 Rate/Yes` / `4 Rate/No`, so the editor's taste learning (`ratings.json`) keeps working. |
| New client workspace | Create `<Brand>/` (the editor creates subfolders on its next run) and write `About this brand.txt` from the PWA brand profile if the file does not exist or is still the editor's blank template. |
| Low confidence | The note asks the unattended run to write `NEEDS-REVIEW.txt` in its project folder when footage is unusable or the edit cannot be finished confidently. The bridge turns that into a `Needs attention` flag (the editor still delivers what it made). |

Nothing in `herk-edit-kit` is modified. The direct phone-to-Drive workflow keeps working
alongside the PWA. Raw uploads go into the editor's folders **only after** the PWA's
approval/automation gate passes, which is what protects Claude usage.

### Known limits (honest)

- The editor handles one primary clip per job. Extra takes and B-roll are supplied as
  files plus instructions in the note; the skill decides how to use them.
- The editor has no explicit confidence score; `NEEDS-REVIEW.txt` is a convention requested
  in the note.
- The editor processes one job per run. Throughput is unchanged by the PWA.
- If Google Drive for desktop is not running, the bridge reports the editor as
  `disconnected` and leaves jobs `Queued`.
