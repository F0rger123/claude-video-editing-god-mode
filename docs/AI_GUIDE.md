# AI guide: claude-video-editing-god-mode

**For AI assistants (Claude, ChatGPT, Codex, Cursor, Gemini).** Someone gave you a link to this repository. Use this page to explain it, set it up, or help them use it. Talk in plain English; the person may not be technical.

## What this is

A video-editing kit for Claude Code. You give it raw footage and it cuts out silences and mistakes, adds captions and motion graphics, and renders a finished reel, Short or long-form video on your own computer. It comes with 34 skills: zooms, lower thirds, list and tier-list videos, motion-graphics films, real sound design and YouTube packaging.

**Usually used by:** A creator or small agency owner who wants Claude to edit their videos, or a developer helping them.

## Ask first

Ask these together in one short message, then repeat back what you heard in a line or two. Skip anything they already told you.

- What do you want to make: a reel or Short, a long-form video, a list or tier-list video, a brand film or showreel, or a video from a website?
- Do you want the whole workspace on this computer, or only the skills as a Claude Code plugin?
- Is this a Windows, Mac or Linux computer, and do you already have Node.js 22 or newer and FFmpeg?

## Set it up

Do one step at a time. Check each one worked before moving on.

| # | Do this | It worked if |
|---|---|---|
| 1 | Install Node.js 22+, FFmpeg and Chrome if missing, then run `npm install` in the repo folder | No install errors |
| 2 | `npm run setup` | It reports Node, FFmpeg, Chrome and the HyperFrames renderer as ready |
| 3 | `npm run demo` | A starter video renders without any footage or API key |
| 4 | Optional: copy `.env.example` to `.env`; the person adds any cloud transcription or image keys themselves | The file exists; never read the values back |
| 5 | Optional watched folder: set `HERK_DRIVE_ROOT` in `.env`, then `node scripts/drive-inbox.mjs --setup` | The inbox folders exist |

## Use it

- Open the folder in Claude Code and say what you want, for example: "Edit raw/my-clip.mp4 into a 30-second Instagram reel with captions."
- Start with the hub skill `video-editing-god-mode`; it picks the right editing skill.
- Teach it your style: copy `brands/example-brand/`, list reels you like, and rate finished options Yes, Maybe or No.
- Skills only, no workspace: install it as a Claude Code plugin with `/plugin marketplace add F0rger123/claude-video-editing-god-mode`.

## How it works, in plain words

1. Your footage is transcribed on your computer (free) or by a cloud service if you add a key.
2. Silences and fumbled lines are cut, then captions and motion graphics are added.
3. Every edit is checked frame by frame before the final video is rendered.
4. With a watched folder, clips you drop in from any device are edited automatically and the finished options land next to them.

## Never

- Never ask for, paste or print passwords, API keys or tokens. Tell the person where to put them (their own `.env` file or the hosting dashboard) and let them do it.
- Never deploy, push to `main`, change a live database or spend money without the person saying yes to that exact step.
- Never publish or upload a finished video unless the person says yes to that video.
- Never copy personal footage, transcripts or renders into the repo; they stay in ignored folders.
- Never edit `.agents/skills/` by hand: edit `.claude/skills/` and run `npm run sync:skills`.

## Read next

- [Rules for coding agents](CLAUDE.md)
- [Hub skill (start here)](.claude/skills/video-editing-god-mode/SKILL.md)
- [Setup and troubleshooting](docs/SETUP.md)
- [A complete edit, step by step](docs/WORKFLOW.md)
- [Tools, accounts and API keys](docs/TOOLS-AND-API-KEYS.md)
- [Editing house style](docs/EDITING-PLAYBOOK.md)

## When you're done

Tell the person, in a few lines: what is set up and checked, what isn't yet, and two or three things they can ask you next.
