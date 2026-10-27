# add-zooms

Add emphasis motion to a flat talking-head video: **dramatic hard-cut punch-zooms** on emphasised words and listicles, and **subtle Ken Burns slow-pushes** on insightful lines. Transcript-driven, ffmpeg-based, non-destructive.

Built for vertical (9:16) social clips — LinkedIn hot-takes, TikToks, Shorts — where a flat talking-head needs energy without a manual editing timeline.

<p align="center">
  <img src="docs/comparison.gif" width="460" alt="Left: no zooms. Right: cut + zooms." /><br/>
  <em>Same cut — left flat, right with hard-cut punch-zooms on the emphasised words.</em>
</p>

## Install as a Claude Code skill

```bash
git clone https://github.com/louisedesadeleer/add-zooms.git
cd add-zooms
./install.sh
```

This symlinks the repo into `~/.claude/skills/add-zooms`, so `/add-zooms` becomes available in Claude Code and stays updatable with `git pull`. Re-running `./install.sh` reinstalls cleanly (it removes any existing copy first). Set `CLAUDE_SKILLS_DIR` to install somewhere other than `~/.claude/skills`.

Prefer to run it standalone (no Claude Code)? Skip install and jump to [Quick start](#quick-start).

## What it does

You give it a video and a **zoom map** (a small JSON list of moments). It renders a new video where the framing punches in on the words you emphasise. Three moves:

| Move | Use it on | Feel |
|---|---|---|
| **punch** | a single emphasised word | **hard cut in**, hold, hard cut out |
| **ratchet** | a listicle (2–4 items) | each item **hard-cuts up** a level, then cuts back |
| **kenburns** | an insight / thesis line | slow continuous push (the only *smooth* move) |

Everything is a hard cut **except** Ken Burns. A hard-cut zoom reads as intentional only when it lands exactly on the word's onset — timing is the whole game.

## Requirements

- `ffmpeg` (with `libx264`)
- [`openai-whisper`](https://github.com/openai/whisper) CLI (for word timestamps)
- Python 3 with `Pillow` (only for the comparison tool's labels)

## Quick start

```bash
# 1. word-level transcript
ffmpeg -y -i input.mp4 -ac 1 -ar 16000 audio.wav
whisper audio.wav --model small.en --language en --word_timestamps True \
  --output_format json --output_dir .

# 2. write a zoom map (see examples/map.example.json) using the word timings
#    times are in seconds; place `t` on the word's start

# 3. render
python3 scripts/zoom_lib.py render input.mp4 output.mp4 map.json
#    options: --cy 0.42 (focal height for the face)  --cx 0.5  --crf 19
```

Audio is stream-copied; output is `+faststart` for social. Re-run step 3 after editing `map.json` — no re-transcribing needed (~5× realtime).

## The zoom map

```json
[
  {"type":"ratchet","steps":[[4.55,1.16],[5.40,1.20],[5.95,1.24]],"label":"list"},
  {"type":"punch","t":18.70,"peak":1.26,"hold":0.35,"label":"average"},
  {"type":"kenburns","t0":41.14,"t1":45.10,"peak":1.14,"label":"thesis"}
]
```

- `t` / `t0` / `t1` — times in **seconds** (from the word timestamps)
- `peak` — zoom depth (1.0 = none). Punches 1.18–1.30; Ken Burns ≤1.14. Keep ≤1.35 so a 1080p source stays crisp.
- `hold` — how long a punch stays zoomed before cutting back
- Overlapping events are fine — the engine takes the **max envelope**, so releases blend up instead of snapping down.

See [`examples/EDIT-ME.txt`](examples/EDIT-ME.txt) for a plain-language cheat sheet.

## Taste defaults

- **Not every line.** Leave long stretches at 1.0× — the rest beats make the zooms land.
- Focal point `(0.5, 0.42)` = centered, biased up toward a face in a vertical frame. Use `--cy 0.5` for landscape / scenery.
- Ratchets **escalate** (each step deeper) so a list *builds*.

## Before / after comparison

Prove the difference with a synced split-screen:

```bash
python3 scripts/make_comparison.py no_zoom.mp4 zoomed.mp4 comparison.mp4 \
  --left-label "no zooms" --right-label "cut + zooms"
```

Left gets a grey pill, right a hot-pink one. Both are scaled to the right video's size and hstacked; audio comes from the right side.

## How it works

The whole clip is one piecewise-linear `zoom(t)` timeline fed to ffmpeg's `zoompan`. A "hard cut" is two keyframes one frame apart (an instant scale jump); Ken Burns is a real ramp. Focal offset is `iw*cx*(1-1/zoom)` / `ih*cy*(1-1/zoom)`, which is 0 at zoom 1 and biases toward `(cx, cy)` as it zooms in.

## License

MIT
