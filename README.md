<p align="center">
  <img src="assets/banner.svg" alt="Claude Video Editing God Mode: raw footage in, finished reels out" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin%20%2B%2016%20skills-7c3aed?style=for-the-badge" alt="Claude Code plugin with 16 skills">
  <img src="https://img.shields.io/badge/Codex-mirrored-c026d3?style=for-the-badge" alt="Codex mirrored">
  <img src="https://img.shields.io/badge/PWA-God%20Mode%20Cut-f97316?style=for-the-badge" alt="God Mode Cut PWA">
  <img src="https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge" alt="MIT">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/HyperFrames-0.7-0d1117?style=flat-square" alt="HyperFrames">
  <img src="https://img.shields.io/badge/GSAP-3.14-0d1117?style=flat-square&logo=greensock&logoColor=88ce02" alt="GSAP">
  <img src="https://img.shields.io/badge/whisper.cpp-local-0d1117?style=flat-square" alt="whisper.cpp">
  <img src="https://img.shields.io/badge/Next.js-16-0d1117?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Supabase-RLS-0d1117?style=flat-square&logo=supabase&logoColor=3ecf8e" alt="Supabase">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-0d1117?style=flat-square&logo=cloudflare&logoColor=f38020" alt="Cloudflare Workers">
</p>

<h3 align="center">Claude edits your videos. Your clients upload from their phone, approve the cut, and it posts itself.</h3>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-what-you-get">What you get</a> ·
  <a href="#-the-skills">Skills</a> ·
  <a href="#-god-mode-cut-the-phone-app">Phone app</a> ·
  <a href="#-how-it-fits-together">Architecture</a> ·
  <a href="#-teach-it-your-taste">Your taste</a> ·
  <a href="#-part-of-claude-business-god-mode">Business God Mode</a>
</p>

---

> [!IMPORTANT]
> **AI agents (Claude, Codex, Cursor, Gemini): start here.** If someone pasted this link and asked you to set it up:
> 1. Read [`.claude/skills/video-editing-god-mode/SKILL.md`](.claude/skills/video-editing-god-mode/SKILL.md) (the hub) and [`CLAUDE.md`](CLAUDE.md) (workspace rules).
> 2. Ask two things only: *what do you want to make* (reel, Short, long-form, showreel) and *do you want the phone app too*.
> 3. Run the [Quick start](#-quick-start), then `npm run demo` to prove the render path works before touching real footage.
>
> Never ask for or print API keys. They go in `.env`, which Git ignores.

## ⚡ Quick start

```bash
git clone https://github.com/F0rger123/claude-video-editing-god-mode.git
cd claude-video-editing-god-mode
npm install
npm run setup        # checks Node 22+, FFmpeg, Chrome and the HyperFrames toolchain
npm run demo         # renders a synthetic starter video, no footage or API key needed
```

Then open the folder in Claude Code and say:

```text
Edit raw/my-clip.mp4 into a 30-second Instagram reel. Hook in the first second, captions, motion-graphics B-roll for every point.
```

**Install as a Claude Code plugin instead** (skills only, no workspace):

```text
/plugin marketplace add F0rger123/claude-video-editing-god-mode
/plugin install video-editing-god-mode@claude-video-editing-god-mode
```

## 🎬 What you get

| | |
|---|---|
| **16 editing skills** | Reels, Shorts, long-form, silence and mistake cutting, story planning, motion beats, showreels, website-to-video. Mirrored for Codex in `.agents/skills/`. |
| **406 motion-graphics cards** | Two style packs (`style-library/01-vox-explainer`, `02-kallaway`) with manifests, CSS tokens and editable slots, plus two scene templates. |
| **Free local pipeline** | `transcribe:local` (whisper.cpp, GPU or CPU), Robust Video Matting head pop-outs (`scripts/matte-rvm.py`), preflight and beat-sync validators. No paid API required. |
| **Unattended editing** | `scripts/drive-inbox.mjs` watches an inbox folder, runs `claude -p` with the right skill and brand profile, returns 1 to 6 options, learns from your Yes/Maybe/No ratings. |
| **God Mode Cut PWA** | Phone-first app in `app/`: uploads, approval rules, AI-edit queue, versioned review, client portal, captions, Buffer scheduling, passkey sign-in. White-label by env vars. |
| **Brand taste system** | `brands/example-brand/` (locked caption spec, ratings, inspiration notes) and `CLAUDE.local.example.md` for your personal house rules. |
| **Editing playbook** | [`docs/EDITING-PLAYBOOK.md`](docs/EDITING-PLAYBOOK.md) and [`MOTION_PHILOSOPHY.md`](MOTION_PHILOSOPHY.md): the measured house style every skill follows. |

## 🧠 The skills

| Skill | Use it when you want to |
|---|---|
| [`video-editing-god-mode`](.claude/skills/video-editing-god-mode/SKILL.md) | **Start here.** Routes the request and enforces the house rules |
| [`short-form-edit`](.claude/skills/short-form-edit/SKILL.md) | Turn talking-head footage into a reel, YouTube Short, TikTok or short ad |
| [`edit-video`](.claude/skills/edit-video/SKILL.md) | Do a complete long-form (16:9) edit, transcript to verified render |
| [`cut-silences`](.claude/skills/cut-silences/SKILL.md) | Remove dead air and tighten pacing |
| [`cut-mistakes`](.claude/skills/cut-mistakes/SKILL.md) | Remove stutters, repeated words, false starts and retakes |
| [`video-storytelling`](.claude/skills/video-storytelling/SKILL.md) | Build the visual layer as one persistent world the camera moves through |
| [`hyperframes-video-beats`](.claude/skills/hyperframes-video-beats/SKILL.md) | Plan, time and validate motion-graphic beats for long-form |
| [`make-a-video`](.claude/skills/make-a-video/SKILL.md) | Make a video from scratch, beginner friendly |
| [`motion-showreel`](.claude/skills/motion-showreel/SKILL.md) | Build a 10 to 30 second brand reel or motion showreel |
| [`website-to-hyperframes`](.claude/skills/website-to-hyperframes/SKILL.md) | Turn a website into a promo video |
| [`style-library`](.claude/skills/style-library/SKILL.md) | Pick, customize or extend the card library |
| [`hyperframes`](.claude/skills/hyperframes/SKILL.md) · [`hyperframes-cli`](.claude/skills/hyperframes-cli/SKILL.md) · [`hyperframes-registry`](.claude/skills/hyperframes-registry/SKILL.md) · [`gsap`](.claude/skills/gsap/SKILL.md) | Write, lint, preview and render HTML video compositions |
| [`short-form-video`](.claude/skills/short-form-video/SKILL.md) | Maintain the legacy teaching compositions |

## 📱 God Mode Cut: the phone app

<p align="center">
  <img src="assets/app-login.png" alt="God Mode Cut sign-in screen" width="260">
  &nbsp;&nbsp;
  <img src="assets/app-install.png" alt="God Mode Cut install guide" width="260">
</p>

Clients install it from your website (no app store), drop raw clips from the camera roll, and approve the finished
cut. You see every job in one inbox.

- **Approval gate.** Manual, auto, conditional or full-auto rules plus package limits decide what gets edited.
- **Review and revisions.** Versions, timestamped comments, change requests, client approval.
- **Scheduling.** Buffer GraphQL API, tracked by a 5-minute cron tick.
- **Client isolation.** Postgres RLS and narrow RPCs, proven by `app/supabase/tests/isolation.test.sql`.
- **White-label.** Set `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_AGENCY_NAME` and `NEXT_PUBLIC_SITE_URL`.

Deploy (free tiers work): [`app/docs/DEPLOYMENT.md`](app/docs/DEPLOYMENT.md). Develop:

```bash
cd app
npm ci
cp .env.example .env.local     # Supabase URL + anon key, service role key, CRON_SECRET, BUFFER_API_KEY
npm run dev
```

## 🗺 How it fits together

```mermaid
flowchart LR
    Phone(["📱 God Mode Cut PWA"]) --> App["Next.js on<br/>Cloudflare Workers"]
    App <--> SB[("Supabase<br/>Postgres + RLS · Auth · Storage")]
    App <--> Buffer["Buffer<br/>scheduling"]
    subgraph PC["🖥 Editing PC (this repo)"]
        Bridge["app/bridge"] --> Inbox["Inbox folder"]
        Inbox --> Runner["scripts/drive-inbox.mjs"]
        Runner --> Claude["claude -p + skills"]
        Claude --> HF["HyperFrames render<br/>FFmpeg · whisper.cpp"]
    end
    Bridge <-- service role --> SB
    HF -- options A..F --> Bridge
```

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Uploaded: client uploads clips
    Uploaded --> PendingApproval: gate rules
    PendingApproval --> Editing: approved
    Uploaded --> Editing: full-auto
    Editing --> Review: bridge returns options
    Review --> Editing: changes requested
    Review --> Approved: client approves
    Approved --> Scheduled: Buffer
    Scheduled --> Published
    Published --> [*]
```

## 🎨 Teach it your taste

1. `cp -r brands/example-brand raw-media/styles/<your-brand>` and edit `inspiration.md` with 3 to 7 reels you love.
2. Ask Claude: *"Study my reference reels and update the inspiration file."* It measures pacing, cuts, framing and type.
3. Approve a caption look once. It becomes the locked `captions.md` and `captions.css`.
4. Rate finished options Yes, Maybe or No. `ratings.json` steers every next edit.
5. `cp CLAUDE.local.example.md CLAUDE.local.md` for your personal rules (no music, which SFX, which tools).

**Your own asset packs** (purchased SFX, LUTs, overlay packs, fonts) go in `raw-media/`, which Git ignores. Describe
them in a `README.md` there and the skills will use them. They are never published by this repo.

## 🔐 Keys and cost

Nothing paid is required. Optional keys (`.env`, see [`docs/TOOLS-AND-API-KEYS.md`](docs/TOOLS-AND-API-KEYS.md)):
ElevenLabs Scribe or OpenAI Whisper for cloud transcription, Kie.ai or Gemini for generated assets,
`ANTHROPIC_API_KEY` in the app for server-side caption regeneration.

## 🧭 Part of Claude Business God Mode

<table>
<tr>
<td align="center" width="25%"><a href="https://github.com/F0rger123/claude-business-god-mode"><b>👑 Business God Mode</b></a><br><sub>the umbrella: run a whole business with Claude</sub></td>
<td align="center" width="25%"><a href="https://github.com/F0rger123/claude-meta-ads-god-mode"><b>📣 Meta Ads God Mode</b></a><br><sub>paid media, paused-first, approval-gated</sub></td>
<td align="center" width="25%"><a href="https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE"><b>🔎 SEO God Mode</b></a><br><sub>audits, local SEO, GSC, AI search</sub></td>
<td align="center" width="25%"><a href="https://github.com/F0rger123/ultimate-crm-template"><b>📇 Ultimate CRM Template</b></a><br><sub>leads, jobs, invoices, SMS, AI assistant</sub></td>
</tr>
</table>

## 📜 Credits and license

MIT. Built on the [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit) by Nate Herk (MIT, plus the
pipeline grant in [`licenses/PIPELINE-USE-PERMISSION.txt`](licenses/PIPELINE-USE-PERMISSION.txt)) and
[HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0, [`licenses/HYPERFRAMES-LICENSE`](licenses/HYPERFRAMES-LICENSE)).
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). GSAP keeps its own license. Style names such as Vox and
Kallaway are aesthetic references only, not endorsements. Teaching example videos from the original kit are not
included; get them from the upstream repository.
