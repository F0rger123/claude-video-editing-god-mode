---
name: video-editing-god-mode
description: CLAUDE VIDEO EDITING GOD MODE hub. Use when someone wants Claude to edit a video end to end, turn raw talking-head footage into a reel, Short or long-form video, set up the phone-to-PC editing pipeline, deploy the God Mode Cut PWA (uploads, approvals, client review, Buffer scheduling), teach Claude a brand's editing taste, or asks which video skill to use. Routes to the right editing skill and enforces the house rules.
---

# Claude Video Editing God Mode

One workspace that turns raw footage into finished, captioned, motion-graphics videos, plus a phone app
that feeds it work and sends finished edits back for review and scheduling.

```
Phone (God Mode Cut PWA)  ->  Supabase job  ->  app/bridge on the editing PC  ->  this workspace
      ^                                                                              |
      +---------- versions, client review, approvals, Buffer scheduling <-----------+
```

## Step 0: work out what the person wants

Ask at most two questions, then route:

| They want | Use |
| --- | --- |
| A reel, YouTube Short, TikTok or short ad from talking-head footage | `short-form-edit` |
| A full long-form (16:9) edit | `edit-video` |
| Only cut dead air | `cut-silences` |
| Only remove stutters, false starts, retakes | `cut-mistakes` |
| A long-form video whose graphics feel like one world | `video-storytelling` + `hyperframes-video-beats` |
| A video from scratch, no footage, beginner | `make-a-video` |
| A 10-30 s brand reel or motion showreel | `motion-showreel` |
| A video from a website | `website-to-hyperframes` |
| Pick or extend a visual style | `style-library` |
| Write or fix a HyperFrames composition | `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `gsap` |
| Phone uploads, approvals, client portal, scheduling | the PWA in `app/` (see `app/README.md`) |
| Unattended edits from a watched folder | `scripts/drive-inbox.mjs` (see "Phone pipeline" below) |

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

## Phone pipeline

1. Deploy the PWA: `app/docs/DEPLOYMENT.md` (Supabase + Cloudflare Workers, free tiers work).
2. On the editing PC, set `HERK_DRIVE_ROOT` in `.env` to a local inbox folder and install the bridge:
   `app/bridge/README.md` (`npm run bridge:dry` first).
3. Uploads become jobs. Jobs pass the approval gate. The bridge drops clips into the inbox, `scripts/drive-inbox.mjs`
   runs the edit with `claude -p`, and finished options come back to the app as versions for review.

## Companion God Modes

This skill is one part of **Claude Business God Mode** (https://github.com/F0rger123/claude-business-god-mode):
Meta Ads God Mode for paid media, SEO God Mode for search, and the Ultimate CRM Template for leads, jobs and billing.
Finished videos feed ad creatives (Meta Ads God Mode) and content for SEO pages.
