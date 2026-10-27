---
name: video-editing-god-mode
description: CLAUDE VIDEO EDITING GOD MODE hub. Use when someone wants Claude to edit a video end to end, turn raw talking-head footage into a reel, Short or long-form video, make a motion-graphics film, list or ranking video, packaging (titles, thumbnails), sound design, copy a trending reel's style, teach Claude a brand's editing taste, or asks which video skill to use. Routes to the right editing skill and enforces the house rules.
---

# Claude Video Editing God Mode

One workspace that turns raw footage into finished, captioned, motion-graphics videos on your own computer.

```
Raw footage (or a watched folder)  ->  transcript  ->  the right skill  ->  render  ->  checked, finished video
```

## Step 0: work out what the person wants

Ask at most two questions, then route:

| They want | Use |
| --- | --- |
| A reel, YouTube Short, TikTok or short ad from talking-head footage | `short-form-edit` (or `ghost-editor` for a full phone-reel pipeline) |
| Hooks, pacing and loops that hold attention in a short | `short-form-retention`, `short-form-video` |
| Copy the editing style of a trending reel onto their footage | `trend-style-copy` |
| Break down why a viral video works (shot list, structure, brief) | `video-structure-analyzer` |
| A full long-form (16:9) edit | `edit-video` |
| An editor's judgment on cuts, pacing, audio levels, captions, color | `editing-videos` |
| Only cut dead air | `cut-silences` |
| Only remove stutters, false starts, retakes | `cut-mistakes` |
| Punch-zooms and slow pushes on a flat talking head | `add-zooms` |
| Animated name tags and broadcast titles | `lower-thirds` |
| A long-form video whose graphics feel like one world | `video-storytelling` + `hyperframes-video-beats` |
| A top-10, "types of", or 0-10 rating video | `ranked-list` |
| An S-to-F tier list video | `tier-list` |
| A local-business makeover episode (before, step board, website reveal) | `business-makeover` |
| Contractor and trades videos | `contractor-styles` |
| Real estate listing tours and agent reels | `real-estate-styles` |
| A premium commercial for a business | `business-motion-film` |
| Launch videos, product promos, kinetic type, brand stings | `motionmaxxing`, `motion-showreel` |
| A short film made entirely in code, in an art style | `lemo-opuscar` |
| A paper-collage explainer | `collage` |
| Sound design with real recorded sound effects | `real-sfx` |
| YouTube titles, thumbnails and description | `youtube-packaging` |
| A video from scratch, no footage, beginner | `make-a-video` |
| A video from a website | `website-to-hyperframes` |
| Pick or extend a visual style | `style-library` |
| Write or fix a HyperFrames composition | `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `gsap` |
| Unattended edits from a watched folder | `scripts/drive-inbox.mjs` (see "Watched folder" below) |

## House rules (apply to every edit)

1. **Free and local first.** Transcribe with `npm run transcribe:local -- <file>` (whisper.cpp). Only call paid APIs
   (ElevenLabs, OpenAI, Kie.ai, Groq) when the person asks and has their own key in `.env`.
2. **Show every point.** Each idea gets one moving visual: animated UI B-roll built in HyperFrames, a card from
   `style-library/`, or the person's own footage. Never leave a static talking head for long.
3. **Hook in the first second.** Follow `docs/EDITING-PLAYBOOK.md` and `MOTION_PHILOSOPHY.md`.
4. **Captions are readable and never cover the mouth.** Use the brand's locked `captions.md` when it exists.
5. **No music unless asked.** Sound effects follow visible actions only. Use the person's own SFX folder first.
6. **Brand taste lives in `raw-media/styles/<brand>/`.** Start a new brand by copying `brands/example-brand/`.
   Ratings (`ratings.json`) teach what the brand likes; read them before every edit.
7. **Verify before you hand over.** Run `npm run preflight` and the skill's validators, render, then watch the
   render (contact sheet or frames) before you call an edit done. See `docs/VERIFICATION.md`.
8. **Assets you do not own stay out of the repo.** Third-party packs (CapCut packs, purchased SFX, LUTs, fonts with
   restrictive licenses) go in `raw-media/` locally, which Git ignores.

## Personal house style

Copy `CLAUDE.local.example.md` to `CLAUDE.local.md` (Git ignores it) and write your own rules there: who the videos
are for, default look, audio, head pop-out method, which tools are allowed. Claude Code loads it automatically.

## Watched folder

Set `HERK_DRIVE_ROOT` in `.env` to a local folder (or a synced Google Drive / Dropbox folder). Drop clips into its
inbox with a short note, run `npm run inbox`, and `scripts/drive-inbox.mjs` runs each edit with `claude -p` and
writes the finished options next to the clips.

## Companion God Modes

This skill is one part of **Claude Business God Mode** (https://github.com/F0rger123/claude-business-god-mode):
Meta Ads God Mode for paid media, SEO God Mode for search, and the Ultimate CRM Template for leads, jobs and billing.
Finished videos feed ad creatives (Meta Ads God Mode) and content for SEO pages.
