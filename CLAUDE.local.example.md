# Local notes (copy to CLAUDE.local.md; Git ignores it)

Your personal editing rules. Claude Code reads `CLAUDE.local.md` on every run in this workspace.
Edit every line to match you. Delete what you do not need.

## Who the videos are for

Most of my videos are me talking to camera about my services. They must be interesting to watch, not just
captioned. Every point I make should be shown, not only said:
- Build animated UI B-roll in HyperFrames: browser windows with a site loading, before/after redesigns,
  search results with a client climbing the rankings, traffic and lead graphs going up, checklists that tick,
  prices and numbers that count up.
- Use the motion-graphics cards (`style-library/`, see `style-library/GUIDE.md` and `registry.json`) and scene
  templates (`style-templates/`), styled to match each other.
- Follow `docs/EDITING-PLAYBOOK.md` and `MOTION_PHILOSOPHY.md`: hook in the first second, every shot moves,
  one visual per idea, readable captions, nothing over my mouth.

## Default look

- Use the kit's own motion style by default: caption style, cards, templates, transitions and fonts.
- My own asset pack (if I have one) lives in `raw-media/my-pack/` with a `README.md` that lists what is in it.
  Use only what that README says to use by default. Check the pack first when I ask for a font, overlay or LUT.

## Head pop-out (speaker cutout)

- For any cutout of me (graphics behind my head), use `scripts/matte-rvm.py` (Robust Video Matting, GPU, free).

## Audio

- No music, ever, unless I ask.
- Sound effects: use MY folder first: `C:\Video Inbox\Sound effects\` (change this path).
  Listen to / measure each file before placing it, reuse the same few sounds consistently.

## Keep everything free

- Transcribe locally: `npm run transcribe:local -- <file>` (whisper.cpp, output matches the word format the cutting
  tools use). Set `HYPERFRAMES_WHISPER_PATH` in `.env` if `whisper-cli` is not on PATH.
- Never call ElevenLabs, OpenAI, Groq, or Kie.ai unless I ask. No paid generation.

## Phone pipeline

`scripts/drive-inbox.mjs` runs every 15 minutes (Windows Task Scheduler) and edits uploads in the folder set by
`HERK_DRIVE_ROOT`. Uploads arrive from the God Mode Cut app through `app/bridge`. My taste: `raw-media/styles/<brand>/`.
