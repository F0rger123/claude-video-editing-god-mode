---
name: trend-style-copy
description: Copy the editing style of a trending (or any reference) Instagram Reel, TikTok or YouTube Short onto the user's own footage. Measures the reference (cuts per 10 s, shot lengths, first cut, loudness, silence), reads its contact sheet for captions, text hooks, zooms, B-roll share and grade, writes a style card, edits to match, then measures the draft the same way and closes the gaps. Use when the clip note says to copy a reference / trend / "make it like this", when a script came from the app's Trends page, or when reference links or screenshots are attached.
---

# trend-style-copy

Goal: the finished edit feels like the reference — same rhythm, caption treatment, hook timing, motion and
sound density — while every word, face, brand and fact is the user's own. Copy **structure and style**,
never the reference's script, music you can't license, watermark or identity.

`S` = this skill's folder. Work in the clip's job folder (the bridge puts references there as
`reference-N.*`; screenshots arrive as images).

## 1. Get and measure the reference

```bash
node "$S/scripts/measure.mjs" <reference file> <job>/style/ref-1
# or straight from a link (public videos; downloads with yt-dlp):
node "$S/scripts/measure.mjs" - <job>/style/ref-1 --url "<instagram / tiktok / shorts link>"
```

This writes `style.json` (cuts, cuts per 10 s, median, shortest and longest shot, first cut, LUFS, silence
share) and `contact.jpg` (1 frame per second). **Open the contact sheet** and note the following.

- **Captions:** font family look (rounded, condensed, serif), weight, case, size relative to the frame,
  color and highlight color, outline or box, words per screen, position, and animation (pop, slide or type).
- **Hook:** what's on screen in second 0–1 (text hook? a face? a result?) and when the first cut lands.
- **Motion:** punch zooms (how often, how big), whip or slide transitions, shake on impacts.
- **Inserts:** share of screen time that is B-roll, screen recordings or UI cards versus the talking head.
- **Grade and framing:** warm or cool, contrast, face size, split screens.
- **Sound** (listen, or run `earshot timeline <ref>`): whooshes on cuts, hits on text, risers, music bed (we
  don't add music unless asked), and speech level.

If `downloaded:false` (private or removed): work from the written trend style in the clip note and any
screenshots. Read screenshots for the caption look and the layout.

## 2. Write the style card

Save `<job>/style/card.md`, keeping it short and concrete:

```
Pace: 2.4 cuts / 10 s, median shot 2.1 s, first cut at 0.9 s
Hook: big 2-line white text hook 0.0–1.5 s, speaker mid-sentence
Captions: 2-3 words, heavy rounded sans, white + yellow key word, black stroke, center-low, pop 120 ms
Motion: punch-in 1.15x on every key word (~every 4 s), no transitions besides hard cuts
Inserts: ~30% screen-recording inserts, full-screen, 1.5-2.5 s each
Sound: whoosh on 1 of 3 cuts, soft hit on each text card, voice -14 LUFS, no music
Ending: loops back into the first frame
```

When the app gave a caption preset, the preset wins for captions. Otherwise use the reference's caption
look, built with the kit's caption tools or the closest CapCut pack preset.

## 3. Edit to the card

Use the kit's normal pipeline: cut-silences / cut-mistakes, then add-zooms (centered with face_track), then
captions, then inserts (HyperFrames cards, mention captures, collage), then real-sfx and earshot for sound.
Hit the card's numbers, not just its adjectives. If the user's footage can't support a move (for example,
there's no B-roll for a 30% insert share), build UI/HyperFrames inserts instead and say so.

## 4. Check the draft against the reference

```bash
node "$S/scripts/measure.mjs" <draft.mp4> <job>/style/draft
```

Compare `style.json` for the reference and the draft. Each should land within these limits:

- cuts per 10 s: within ±25%
- median shot: within ±0.5 s
- first cut: within 0.5 s
- loudness: -14 ±1 LUFS

Look at both contact sheets side by side for captions and inserts. Fix the gaps, measure again, then render
the final.

## 5. Report

In the reply, list:

- the reference URL;
- reference vs draft numbers (pace, median shot, first cut, LUFS);
- the caption look you matched;
- what you couldn't copy, and why.
