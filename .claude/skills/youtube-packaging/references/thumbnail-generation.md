# Thumbnail generation — Nano Banana Pro (the render engine behind Stage 5)

Stage 3 of `SKILL.md` produces thumbnail **concepts** (text). This file is how those
concepts become **actual images**: the model, the tool, the reusable prompt template,
the verify loop, and the failure modes. Tune it as you learn what your audience clicks.

## The decisions (locked in)

- **Model renders the text.** Nano Banana Pro draws the hook word itself (FREE / UNLIMITED /
  $0.62) — no separate compositing layer. So we use the **Pro** tier, whose headline feature
  is legible in-image text. The tradeoff (AI can misspell/garble a word) is caught by the
  **verify loop** below, not avoided.
- **One reusable face.** The creator's identity anchor lives in `media/library/faces/` and is passed as
  a reference on **every** render. It grows over time (more expressions = better). See that
  folder's README.
- **This lives inside `/packaging`**, as Stage 5 — one skill packages a video end to end.

## The loud-vs-calm rule (do NOT reconcile these)

`brand.md` is deliberately **calm/premium** (Linear/Anthropic) for what's *inside* the video.
The **thumbnail is the opposite by design** — big shocked face, giant saturated word, high
energy — because it lives on the browse wall and plays by CTR rules, not brand rules. The
loud frame consistently out-clicks the tasteful one there (see `channel-calibration.md` to
confirm it on your own data). Never "tone down" a thumbnail to match the in-video brand.
Two systems, on purpose.

## Model + specs

- **Model id:** `gemini-3-pro-image` (Nano Banana Pro). Fallbacks if unavailable:
  `gemini-3.1-flash-image` (Nano Banana 2, faster/cheaper, slightly weaker text). Confirm the
  live id with `GET /v1beta/models` if a call 404s — Google renames these often.
- **Output:** 16:9, `image_size` **2K** default (4K for the final keeper). YouTube spec =
  1280×720 min, 2560×1440 ideal, **<2MB**, JPG/PNG. `--jpg` emits the spec-compliant deliverable.
- **Access:** `GEMINI_API_KEY` in `.env`; Gemini API enabled + billing on the Google project.

## The tool

`tools/gen_thumbnail.py` — passes the prompt + the whole `media/library/faces/` kit to the model,
saves the PNG + a sidecar `.json` (prompt, model, seed, refs) so any render is reproducible, and
optionally emits the YouTube-spec JPG.

```
python tools/gen_thumbnail.py --prompt "…full prompt…" --out videos/video-N/packaging/thumbs/A.png --jpg
python tools/gen_thumbnail.py --prompt-file A.txt --out A.png --size 4K --seed 42   # keeper, reproducible
python tools/gen_thumbnail.py --prompt "…" --out A.png --dry-run                    # validate, no billing
```

Generate the 3 A/B/C concepts into `thumbs/A.png|B.png|C.png`. Keep the `.txt` prompt per
variation so refinements are diffs, not rewrites.

**Passing a brand/product logo:** for Claude videos, pass the real logo as an extra `--ref` so the
model reproduces it faithfully (e.g. the Claude Code mascot at
`media/library/logos/claude-code-bot.png`, used as the toggle knob / laptop screen /
corner badge). **Gotcha:** any explicit `--ref` you pass *replaces* the default `media/library/faces/`
kit, so include the face ref explicitly too:
`--ref media/library/faces/face-ref-01.jpg --ref media/library/logos/claude-code-bot.png`.
In the prompt, name the roles: "Image 1 = the creator's identity, Image 2 = the Claude Code logo."

**Comparing variants:** stitch the final A/B/C into one labeled side-by-side
(`thumbs/_ABC-set.jpg`) so you can eyeball the test set together, the way the browse wall will.

## How to prompt Nano Banana Pro

Write the prompt as a **detailed brief for a human artist**, not a keyword list. Five rules
that measurably improved output (Google's official guidance, confirmed in practice):

1. **Positive framing, not negation.** Say what you *want* ("bright, softly-blurred studio")
   rather than what you don't ("not dark, no clutter"). The model can latch onto a banned noun
   and *include* it. ONE exception earns its keep (proven failure mode, see below): a single
   line forbidding text/logos *inside* sub-images.
2. **Labeled brief:** Reference-roles → Subject & Action → Setting & Lighting → Composition →
   Text → Style. Each gets a full descriptive sentence.
3. **Explicit reference roles.** "Image 1 is the identity reference — this exact man's face.
   Image 2 is the Claude Code logo — reproduce it faithfully on the toggle/laptop." Never just
   "the reference."
4. **Cinematographer language.** Real lens + lighting terms buy depth and integration:
   `85mm at f/2, shallow depth of field`, `soft diffused window light`, `green rim light`,
   `bokeh background`. This is what stops the face looking pasted-on.
5. **Text = quoted word + described font + placement.** `"FREE" (F-R-E-E)`, heavy bold
   condensed sans-serif, color, outline, where it sits. One dominant hook only.

## Template 1 — graphic composite (the loud A/B style)

```
A high-energy, photorealistic YouTube thumbnail, 16:9, in a bold saturated modern-tech style.

REFERENCE ROLES: Image 1 is the identity reference — render this exact man with an identical
face, beard, hair and skin tone. Image 2 is the Claude Code logo, a coral-orange pixel-robot
mascot — reproduce it faithfully as <the toggle knob | the corner badge>.

SUBJECT & ACTION: the man from Image 1, large, head-and-shoulders on the <right> third,
<happily-shocked | amazed and delighted> — big open-mouthed smile, raised eyebrows, wide bright
eyes — looking straight into the lens.

SETTING & LIGHTING: a dark, softly blurred studio with a <green> key-glow and a crisp rim light
that separates and relights him so he sits naturally in the scene and matches its color grade.
Shot on an 85mm lens at f/2, shallow depth of field, bokeh background.

TEXT: one headline word, "<WORD>" (letters <W-O-R-D>), in a heavy bold condensed sans-serif,
<color> fill with a thick <outline> outline and a soft drop shadow, huge on the <opposite> side —
the single dominant focal element and the only headline.

COMPOSITION: <the toggle + 3 proof cards | a burst of ~12 image cards pouring from the logo>.
Every small card holds AI-generated art as pure imagery only (no lettering inside them).

STYLE: clean, punchy, professional high-CTR thumbnail — bright, saturated, high dynamic range,
uncluttered, with the headline dominant.
```

## Template 2 — realistic office photo (the authentic C style)

```
A bright, authentic DSLR photograph used as a YouTube thumbnail, 16:9 — one genuinely
photographed, natural scene.

REFERENCE ROLES: Image 1 = this exact man's identity. Image 2 = the Claude Code logo, shown
large and crisp on the laptop screen.

SUBJECT & ACTION: the man from Image 1 at a wooden desk, big genuine open-mouthed smile, looking
into the lens, holding up ONE printed poster in his right hand; his left hand rests on the desk.
Both hands correctly formed with five fingers each; no other hands anywhere in the image.

SETTING: a bright home office — window with soft natural daylight, a plant, an open laptop turned
to camera showing the Claude Code robot big and crisp, a few printed AI character prints on the desk.

PROPS & TEXT: a bold "FREE" (F-R-E-E) card, white letters on red, standing upright in an acrylic
sign holder on the desk (freestanding, no hand) — the only text. In his hand, a poster of ONE
striking, wholesome AI-generated character (a cute 3D robot or cartoon kid hero), family-friendly.

LIGHTING & CAMERA: soft diffused window light, warm; 35mm at f/2.8, shallow depth of field, sharp
on face and signs; natural color grade.

STYLE: a believable candid desk photo — premium, bright, wholesome.
```

## The verify loop (run on EVERY render before surfacing it)

Read the generated image back and check — regenerate if any fail:

1. **Text is spelled right and legible.** The #1 failure of model-rendered text. Zoom in; if
   the word is garbled/misspelled/warped, regenerate (re-state the letters, or reduce word length).
2. **Face reads as the creator.** Same features as the reference; not a generic AI face, not distorted.
3. **One dominant hook.** No second competing text block; the frame is not busy (busy = the
   average tier, single hook = the top tier).
4. **Bright + saturated + positive.** Not dark/muted; expression is high-energy positive, never
   the facepalm/flat-smile floor.
5. **Hands sane — count them.** No extra fingers, nothing crossing the face, and **no phantom
   hand** (a held sign whose arm can't be the subject's). If a two-prop pose creates an impossible hand,
   put one prop in a **desk sign-holder** instead of a hand — a reliable fix.
6. **No stray lettering.** Sub-image cards, posters and props carry **no text or brand logos** —
   garbled labels and stray rival logos love to creep into sub-images. Only the one mark you asked for.
7. **On-theme + wholesome.** Held/showcase images match what the video really makes (honesty
   guardrail) and are family-friendly — no glamour/"AI-girlfriend" bait, watch for IP (Superman,
   real product brands) unless you okay it.
8. **Spec.** 16:9, ≥1280px wide, exports <2MB as JPG.

Only surface renders that pass. Review A/B/C together and steer from there.

## Iterating (the back-and-forth)

- Change one thing at a time (expression OR color OR word placement) so cause↔effect is clear.
- Reuse `--seed` to hold composition steady while nudging the prompt; change the seed to explore
  a genuinely different composition of the same concept.
- Keep each variation's prompt in `thumbs/A.txt` etc. — refinements are diffs.
- Optional **style anchoring:** feed 2–3 of your real top-CTR thumbnails as extra `--ref`
  images so renders inherit your look, not generic AI gloss. (Your face ref stays first.)

## Failure modes → fixes

| Symptom | Fix |
|---|---|
| Garbled / misspelled word | Re-state letters (`F-R-E-E`); shorten to 1–2 words; regenerate; try Pro if on Flash. |
| Face drifts from the reference | Add more/better refs to `media/library/faces/`; say "exact same face, do not stylize". |
| Busy frame / two text blocks | "ONLY one headline, no other text"; remove the object; simplify background. |
| Dark / muted | Name the saturated accent explicitly; add "bright, high contrast, rim-lit". |
| Square / wrong ratio | Enforced by `image_config` (16:9) — if it still drifts, restate 16:9 in the prompt too. |
| Face looks pasted-on (flat cut-out) | Add cinematographer relight language: "relit to match the scene's <green> glow, same color grade, 85mm f/2, rim light, soft edges." |
| Phantom / impossible hand | Give both hands a job ("right hand holds X, left rests on desk; no other hands"); or move a prop into a **desk sign-holder**. |
| Garbled text / rival logo inside a sub-image | One explicit line: sub-images are "pure imagery only, no lettering or brand logos" (the sole earned negative). |
| Off-theme / glamour / IP in showcase | Use what the video actually makes (storybook character); "wholesome, family-friendly"; avoid glamour + trademarked characters/products. |
| No image returned | Check the printed model text (safety block / wrong model id); adjust prompt or `--model`. |
