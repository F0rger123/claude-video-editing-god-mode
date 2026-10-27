# Playbook: every style, every building block, everything we learned

The one-page inventory of this skill. Each style says how to ask for it.

## Named styles (recipes)

| style | ask for it | what it is | best for |
|---|---|---|---|
| **Clean OS** | "edit this in Clean OS" | An Apple-ad talking head that lives inside your phone. 1–3 lowercase word cards resolving from blur (Inter), wide/tight cuts from one 4K camera, literal iOS scenes for what you say (date picker, lock-screen notifications, a search with a loading bar stuck at 97%, a Photos memory card), a red Figma selection box with a cursor, perspective text with a draining ring, one handwritten word (Great Vibes), a small sound on every graphic. | reflective or explanatory monologues |
| **Vector explainer** | "make an animated explainer" | No footage. One continuous SVG world a camera travels through, a subject that draws itself, serif headlines on panels, words that rise from blur as the narrator says them, an ElevenLabs narrator, a piano bed. | parables, life lessons, concepts you can draw |
| **RESULT** | "edit this in RESULT style" | A warm podcast edit: one or two Inter Tight words with a small line and one big word, Caveat handwriting, navy cards with film dust, polaroids, a paper stack that swaps pictures stop-motion, film-burn light leaks, comic props (REC frame, an incoming call you decline, a cursor clicking a dialog), dissolves between lines. | storytelling, nostalgia, podcast monologues |
| **POV montage** | "cut these POV clips into a reel" | Several first-person clips cut into a story: a flash-forward hook, speed-ups, text behind you, a cursor-click fact card, a freeze frame with a zoom, a record scratch and a meme, on the editorial motion layer. | trips, vlogs, a day from smart glasses or a GoPro |
| **Seoul list** | "Seoul list", "a list reel over B-roll" | A voice-over list over fast B-roll (1.4 s shots, no talking head): one big word per line, italic serif (Playfair) for places and moods, heavy Inter Tight for facts, with a subline tucked under it; white word flashes; white collage pages in the hook (the shot shrinks into a card, a red glitch word, a photo card flying in, Fluent hand and eye stickers); triptychs; an Instagram comment card for the personal aside; a macOS frosted window swapping cut-outs; blue highlight words; an iMessage outro (typing bubble, word bubble, emoji tapback). | "N things about a city / a trip / a topic" read over B-roll: yours first when you hand it over, else your library, else stock or AI in one graded world |
| **stan style** | "stan style", "tool tutorial" | A seated talking head explaining a tool, with real screen recordings popping into the top band behind the speaker (the head is cut out and overlaps the screen; the speaker moves down only if the eyes would hide), small white lowercase chest captions that cut phrase by phrase (single words in the hook and the diagram, forehead words near the end), a hook card (icon rows + a black-on-white strip title), one white diagram whose curved lines draw on after a zoom-blur, «[Step n]» labels with app icons under the chin, a comment-keyword CTA with a logo, «*asides*» above the head. | "how to do X with tool Y" in steps, with screen recordings |

Each lives in `recipes/<name>/` with a README (the full grammar and pipeline), a SYSTEM.md, its scripts and a component catalog; the vector explainer, Seoul list and stan style also ship an English worked example.

## Presets (one line in reel.json: `"style": "<name>"`)

| style | looks like | best for | sound · music |
|---|---|---|---|
| `clean` | bold mixed-case captions, one keyword colour, snap zooms | business advice | restrained · none |
| `editorial` | lowercase blur-in captions, tilted pill tags, highlight wipes, full-screen scenes | data, insight | standard · tense electronic |
| `meme` | outline captions, emoji and memes beside the head, chips and big cards | entertainment, hot takes | rich · quirky |
| `cinematic` | film grade, grain, vignette, B&W B-roll, glowing serif keywords | stories, founder journeys | restrained · ambient |
| `launch` | dark UI windows with typed prompts, phone chats, glitch cuts | product and AI launches | standard · upbeat electronic |
| `kinetic` | full-screen word-by-word type, speaker in a round window | hooks, quotes, manifestos | standard · percussive |
| `pop` | giant words behind the speaker, uppercase captions in hot colour boxes | personal brand, bold claims | standard · upbeat pop |

Or show it a reel you love: `scripts/reference_study.py` reverse-engineers it (Gemini 2.5 Pro edit log + frames) and the agent maps it onto your recording. A look you like can be saved as a new preset or recipe.

## Pipeline

0. `doctor.sh`: tools, keys, library, each with its fix.
1. `prep.sh`: 1080×1920, voice at −16 LUFS; a contact sheet; confirm the right person is on screen.
2. `denoise.sh` for outdoor takes (DeepFilterNet3, capped at 20 dB).
3. `transcribe.py` (every take, word times) and `face_track.py` (keeps captions off the face).
4. Choose the best complete take per line (or `autocut.py` for one clean take); re-transcribe the cut; Gemini 2.5 Pro verbatim audit.
5. Pick a preset or recipe; plan beats on spoken words.
6. `build.mjs` (taste defaults + warnings), then `approval_sheet.py`: one page with a frame at every cut and beat, the timeline and every warning; the user approves before the render.
7. Render; `render_report.py`: pass/fail per check with a fix each, at most 3 fix-and-re-render rounds; `qa.py` for SFX against the voice on a stem, A/V lengths, matte, transitions and shader flicker.
8. Deliver; `taste.py log-reel`; `save_style.py` keeps a look the user loved as a preset.

## Building blocks

- **Captions:** house (Arial bold 56, outline, lower third), pill, clean, editorial (lowercase blur-in, tags, highlight wipes), mini, word cards (Clean OS).
- **Caption templates (v0.3):** hype, explosive, line-focus, neo-minimal, karaoke-fill, highlighter, with one keyword per phrase (heuristic, forced or Gemini).
- **Kinetic type (v0.3, `textfx`):** hook (a giant cropped word at frame 0), drum (3D word cylinder), scramble (glyphs lock on the word), flipstack (cards pile up), headline (masked rise + brush mark, "not X -> Y"), spring (letters on a spring).
- **Shader looks (v0.3, Paper Shaders):** warm-grain, mesh-calm, ink-warp, god-rays, dither-retro, fluted-self (ribbed glass over your own frame) behind a word scene; film-grain and halftone over the speaker.
- **Animated emoji (v0.3):** 50 Fluent reactions (40 animated) that pop next to the head with overshoot.
- **Transitions (v0.3):** 10 eased ones on stock ffmpeg (dissolve, zoom blur, soft wipe, crosswarp, warp wipe, dip to black, whip, scaled push, flash, static wipe) laid over the cut; the voice stays a hard cut.
- **Film looks (v0.3):** six film stocks (Portra 400, Vision3 500T, Eterna 500, Ektachrome 100D, Tri-X 400, CineStill 800T) with datasheet grain and halation, baked into the plate.
- **Person matte (v0.3):** BiRefNet cut-out for words behind you, computed only for those seconds.
- **Cutout effects (v0.3):** one BiRefNet pass per 2-3 s beat: background swap, portrait blur, selective colour, spotlight, die-cut sticker freeze, neon outline, clones, pop out of a phone frame; reel-wide selective/spotlight/blur looks (`look.cutout`); covers for Reels and YouTube (`cover`). Words can also slide through the speaker (`behind` + `through`).
- **Card beats on the word:** big (claim slam, count-up), chips, strike, quote, list + stamp, emoji / logo / meme (reaction slot), behind (giant word behind you), title, broll, endcard.
- **Full-screen scenes:** card (pill + cursor click), stats (glass badges), fly3d (camera through 3D words), image (still B-roll), ui (typed prompt), device (phone chat), kinetic (word-by-word + round window), sentence (hero word lands).
- **Motion:** hard cuts by default; blur / expand / wipe / glitch only at section changes; snap zooms; slow pushes; wide ↔ tight; freeze frames.
- **Layout:** face-aware placement (below the chin, above the head, shrink; never on the eyes or mouth) inside the Instagram / TikTok / Shorts safe area, clear of the like column; one card and one reaction at a time.
- **Look:** grade, grain, vignette per style; person matte for text behind you; keep the footage's own mood.

## Sound

- **Voice tools (v0.3, optional):** ClearerVoice super-resolution for band-limited mics, silero-vad speech islands (`autocut.py --vad`), a picture-vs-voice length check in qa.py.
- **Effects:** UI (pop, click, tick, keyboard, notification, ding, shutter, a message-send swoosh), whooshes and risers, impacts and booms. Only Mixkit sounds (free licence), fetched at setup; add your own memes and meme sounds with `meme_add.py`.
- **Music beds (13, Mixkit):** calm (lo-fi-02, digital-clouds, silent-descent, vastness), tech (deep-techno-ambience, cyberpunk-city, infinity, brainiac), fun (comical, keeping-fit, happy-times, life-is-a-dream), rhythm (vocal-percussions).
- **Mixing:** the voice is levelled first; each SFX role sits a fixed dB under your measured voice peak; music ducks under speech (`music.duck`); final −14 to −16 LUFS, true peak ≤ −1 dB.
- **Voices:** ElevenLabs (`tts_elevenlabs.py`, e.g. Spuds Oxley for a wise elder), Kokoro as a free local fallback.

## Type (free, OFL, Latin + Cyrillic)

Inter (Clean OS, stan style captions and labels), Inter Tight (RESULT, Seoul list, stan style titles), Great Vibes (script word), Montserrat (presets), Playfair Display (cinematic, explainer headlines, Seoul list's italic serif), Geist and Geist Mono, JetBrains Mono (UI windows), Unbounded, Oswald. Arial Bold for house subtitles.

## What we learned (each rule came from a real mistake or a measurement)

**Cutting and takes**
- Transcribe everything and choose takes from the table; cut on word times, never segment times.
- Whisper merges restarts into one clean sentence and smears timestamps. Re-transcribe the cut voice and audit it with Gemini 2.5 Pro.
- A long stretch of voice with few transcript words is a hidden retake. A throat-clear is a short voiced hum with falling pitch (find it with a pitch scan).
- Leave ~0.2 s of breath between sentences. Confirm the right person on screen before rendering.
- Build an attempt log of the whole raw take with Gemini 2.5 Pro before cutting. Hide jump cuts with short dissolves, not a zoom on every cut (three comic punch-ins at most).

**Audio**
- Full-strength denoise leaves a thin, watery voice: cap at 20 dB and add a little warmth.
- Level the voice first; never add gain to the finished mix. The SFX check must exclude the music bed.

**Captions and layout**
- Never cover the face; stay inside the safe area. Light accents need dark text. Hide captions while a headline says the same words. No em dashes on screen; one emphasis mechanism per video.

**Motion and rendering (HyperFrames)**
- Anything tweened twice needs `fromTo` with explicit values; hide each caption with a `fromTo` placed after its fade-in. Grow SVG shapes with `attr`, not scale. Every video needs an id. Lint, snapshot every beat, look, then render.
- Top reels: 113 of 119 transitions are hard cuts, median shot ~3 s, B-roll 20–35 % of runtime, audible SFX 0.4–0.9 per 10 s on graphics, not cuts.

**Sound and memes**
- Measure a reference's sound before copying it: the reference Seoul reel has no audible bed and 3 non-voice hits in 46 s (mix vs a
  speech-enhanced copy), where Gemini's edit log claimed a lo-fi bed and ~25 hits.
- A small sound on every graphic, none on bare cuts. Never the same meme sound twice; 1–3 per minute; never on a word. Meme clips from the internet are other people's media: Instagram and TikTok at your own risk, never YouTube (Content ID).

**Footage and B-roll**
- 4K vertical gives two shot sizes from one camera. No 720p B-roll; on Mixkit only clips offered in 2160p are free for commercial use. Your own unused frames make good B-roll.
- B-roll is the user's world, framed and graded, or nothing (references/broll.md, from an audit of 29 reels).
  - Sources in order: the user's own footage, then stills in one frame language (AI or stock images), then stock video
    that matches the reel's world.
  - Hard rules: the configurable B-roll people rules (`people-rules.json`, empty by default; e.g. exclude women,
    children or symbols), checked by Gemini on every shot. Every shot shows its line. The speaker's face is never regraded.
  - One character per idea. A spoken list becomes typography.
  - Talking heads: <= 3 inserts per minute, <= 25 % full-screen, the speaker's face on screen >= 65 %.
  - Every insert is graded onto the speaker's plate as shot (`insert_prep.py`); `broll_vision.py picks` shows the user every shot first. `broll_qa.py` fails the render past these limits.
- Small glances stay on screen. Cover only real look-aways (> 0.5 s or > 12 deg); hiding every flagged frame put one
  reel's speaker on screen 33 % of the reel.
- Defaults:
  - stock only as a last resort and inside a frame (talking-head styles; Seoul list is full-screen B-roll by format);
  - the user's own footage found automatically with a face check (only they appear), and the picked frames shown to
    them before the render;
  - one fixed house look per style (`recipes/<style>/house.json`): type, captions, accents, insert framing, the
    speaker's face as shot (never regraded).
- New components every reel in a named style: scenes, props, polaroid / collage treatments, transitions, hooks and
  outros not used in the style's last 7 reels (`components.py plan / check / record`).
- stan style needs real screen recordings; without them, propose another style rather than filling the band with stock.
  Seoul list is a format, not a footage source (the footage the user hands over first, then their library, then stock
  or AI full screen), held to one graded world (conformed to the main footage as shot) with no posed stock models.

**Workflow**
- Nothing renders before the user approves the approval sheet; a failed render report gets at most three fix rounds, then the user decides.
- One reel at a time: no batch render of a wave of styles without a sheet per reel (7 styles from one template in 7 minutes came out with almost no approval files).
- Every correction is recorded as taste in the user's words; learned rules are tagged as the skill's, never as "you said".
- Cut picture and voice at the same frame-snapped times, or the voice drifts early across the pieces.

**Tools**
- Pin the HyperFrames CLI (`npx -y hyperframes@<version>`): an unpinned `npx hyperframes` fetches whatever was just published, and a release whose tarball 404s fails every render mid-batch.
- Phone-filmed screens show the browser chrome (tabs, a URL with access tokens, bookmarks). Find the lowest line the chrome ever reaches across the cut, and clamp every zoom so nothing above it is ever in frame.
- Snapshot every beat and read the strips before rendering (recipes/seoul-list/snap.py): the first Seoul-list build had
  six visual bugs (ghost copies visible from frame 0, collapsed word gaps, an empty card after its footage ended) that
  lint and the timeline passed.
- Check a reference's geometry on full-res frames, not just its look: the stan-style breakdown said the speaker is "reframed
  down" under the panel, but face tracking on the reference put the eyes at y 815 in both split and full shots; and the
  panel is BEHIND the head (the cut-out hair overlaps the screen: it was first read the other way round and only the
  smoke render showed it); its title was black on white, not white on black; the "24/7 strobe" is not in the frames.
- Kinetic exits that stagger per letter or card must finish by the block end (fixed in kinetic.mjs: `t >= t1` forces the exit); also give each block a hard visibility window in the page.
- Search the HyperFrames registry (`npx hyperframes catalog --query`) before hand-building a look. Validate API keys with one call before a batch.
