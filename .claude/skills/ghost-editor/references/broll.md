# B-roll, covers and motion: the rules and their QA

From an audit of 29 talking-head reels (speaker recognition, a B-roll/graphics classifier, colour stats, build data;
Gemini critiques checked on frames). The weak reels did not animate worse. They showed **too much of the wrong footage,
too often**:
- forced covers: one reel had 31 cover windows in 63 s, 10 of its 11 inserts were covers, and the speaker was on screen 33 %;
- stock strangers, 15-44 b* colder and 0.3x as saturated as the warm plate;
- full-screen cutaways: the speaker was on screen a median 51 %, against 78 % in the calibration reels;
- static graphics, small low-contrast captions, cards over faces, and render faults.

`scripts/broll_qa.py` fails a render on every one of these, and `scripts/insert_prep.py` prepares inserts so they pass.

## 0. Hard rules (they override everything below)

1. **People in B-roll and stock (images too): the configurable people rules.**
   `people-rules.json` (next to SKILL.md) lists what must never appear in a B-roll shot, a stock image or a backdrop.
   It is empty by default: every channel has its own. Ask the user once whether they have such rules (for example:
   no women, no children, no religious, political or national symbols, no alcohol) and write them as rules; never
   invent any. `people-rules.example.json` shows the format with three rules. Each rule is:
   - `id`: the key the vision model answers true or false for each shot;
   - `ask`: what counts, written for the model. Say what a partial view counts as (a hand, a back, a distant figure, a
     poster or a screen showing one) and what to answer when it can't tell;
   - optional `person`: an attribute asked of every visible person or body part, with the values that pass; anything
     else, "unclear" included, breaks the rule;
   - optional `description_words`: a regex on own-footage descriptions, so `own_footage.py find` never offers such a clip.

   Enforced three times:
   - at sourcing: `insert_prep.py` refuses a shot (Gemini via `broll_vision.py`), and `own_footage.py find` never
     offers a clip whose description matches a rule;
   - on the pick sheet the user confirms before the render: `broll_vision.py picks --project $P` shows every B-roll shot
     and stock image with its line and the verdict;
   - in the QA: `broll_qa.py` check `people` fails the render. An unchecked shot fails too. With no rules set the check is
     skipped (the line match below still runs).

   The checks need `GEMINI_API_KEY` (Gemini 2.5 Flash; the free tier is enough for a reel). Answers are cached per clip
   window in `library/vision-cache/`; changing the rules re-asks every shot. When the user looks at a flagged shot and says
   it's fine: `broll_vision.py confirm <clip> --note "<their words>"`.
2. **The speaker's face is never regraded.** The speaker's footage keeps its natural, as-shot colour: no house grade, no
   film look unless the user asks for one, no CSS filter on the plate. Inserts are conformed TO the speaker
   (`insert_prep.py --ref <plate as shot>`). A style still fixes the look of its own graphics (section 5b).
   `house_look.py apply` is retired, and `broll_qa.py` check `as_shot` fails a regraded plate.
3. **Fewer B-rolls, each on its line.**
   - Talking heads: at most 3 inserts a minute.
   - Every shot shows what the line under it says (check `match`: "no" fails, "partly" warns). With no shot that
     shows the line, leave the line bare (the speaker's face, or type) rather than reach for a loose one.
   - Stock IMAGES are allowed and preferred over many video cutaways: one still inside a frame, a card or a collage
     page carries an idea with less churn than three clips.

## 1. Covers: keep the glances

Run `facescan.py`, then `plan_cut.py` (a pre-cut source) or `cover_windows.py` (a finished cut). Both still flag every
frame that is not clean on the lens, then label each window **keep** or **cover**:
- **keep** (stays on screen): blinks, micro-glances and small nods. That is any window up to 0.5 s with the head within
  12 deg of the speaker's own median (yaw and pitch) and the eyes back on the lens within 0.5 s.
  - In calibration, 29 of one reel's 31 windows were 0.03-0.4 s blips, all within 4 deg yaw and 7 deg pitch. They read
    as a person talking, not as a fault.
- **cover**: a real look-away. That means the eyes off the lens (down to notes, sideways) or closed for more than 0.5 s
  in a row, or the head turned or bowed more than 12 deg.
  - The same reel had one: eyes off for 0.73 s.

Cover a real look-away with the cheapest fix that works, in this order:
1. **Trim or cut.** In a pause or at a sentence edge, cut it out. A split edit (the picture cuts a few frames before
   the sound) handles an eyes-down at the end of a line.
2. **Tight-crop punch.** Cut to the tight shot (or a crop on the hands or mouth) for the look-away. The cut reads as
   rhythm.
3. **Hold the current graphic.** Extend the scene or card that is already on screen until the eyes are back.
4. **Framed or split insert on a designed page:** a polaroid or photo card on the reel's surface colour, a phone card,
   a top-half split. It stays inside the reel's frame language.
5. **Full-screen stock**: last.

There is no `assert_covered()` any more: the build does not demand that every flagged frame is hidden. It prints the
cover windows, how each one is handled, and the windows it keeps.

## 2. Budgets (talking-head styles; the QA fails past them)

| what | limit | audit numbers |
|---|---|---|
| full-screen B-roll | <= 25 % of the runtime | weak reels 30-40 %; a framed-stills reel 26 % |
| speaker's face on screen | >= 65 % | calibration 78 % median; a reference edit 69 %; weakest reel 33 % |
| inserts per minute | <= 3 (a chain of shots back to back = 1; a framed PiP counts) | calibration 4.5 mean; weak reels 6.5-14.3 |
| graphic scenes | median <= 2.5 s, >= 50 % of their frames moving | a weak reel 4.2 s and 16 % moving; a reference 2.2 s and 58 % |

Seoul list and POV montage are **B-roll-led** (`--profile broll-led`): the reference Seoul reel is 54-69 % B-roll by
design, so the first three rows don't apply there. Sourcing, grade, motion, faces and hygiene do.

## 3. Sourcing priority

1. **The user's own footage, found automatically** (`scripts/own_footage.py`):
   - Sources: the same shoot (the 4K camera's unused frames, hands, the room, the wide), the Photos library and the
     user's GoPro/DJI/phone folders (`--root`, or `library/me/roots.json`).
   - Every clip is face-checked: YuNet + SFace against the user's face (`library/me/face_ref.npz`, built once from one
     of their own plates; it never leaves the machine).
     - Only clips where nobody or only the user appears are offered.
     - Someone else in a picked window stops `insert_prep.py`, and `broll_qa.py` fails the render.
   - Before the render, `own_footage.py sheet --project $P` builds a confirmation sheet: sampled frames of every picked
     clip, faces boxed "you" / "NOT YOU?". **Show it to the user and wait for their yes.** Family and friends end up in
     personal footage; a face detector alone is not enough.

     ```bash
     python3 $S/scripts/own_footage.py me <one of your plates>    # once per Mac: your face reference (look at library/me/refs.jpg)
     python3 $S/scripts/own_footage.py index --describe          # incremental; Gemini one-line descriptions + tags per clip
     python3 $S/scripts/own_footage.py find beach sea --people me    # clean windows for a line
     python3 $S/scripts/own_footage.py sheet --project $P -o $P/build/own-footage-confirm.jpg
     ```
2. **Stills in ONE frame language for the whole reel**: AI stills (`broll_gen.py`) or stock IMAGES as polaroids on navy,
   a phone card, a framed print, a collage page. Objects and places; people only where the idea needs one, inside the
   people rules. Preferred over several video cutaways.
3. **Stock video: the last resort, and only inside a frame** (a polaroid, a phone, a card) in talking-head styles:
   - never full screen when anything else fits, and never for a list;
   - only when it matches the reel's world (the same light, place, season and era; no posing models);
   - conformed (section 4).

   `insert_prep.py` records each insert's source (own / ai / stock, from its name or `--kind`), and `broll_qa.py` fails
   a stock shot that is full screen for 0.4 s or more. Stock is not banned.

   **B-roll-led formats (Seoul list, POV montage)** are full-screen B-roll by design, so stock or AI may fill the
   screen there. The order is the footage the user hands over for the reel (always used), then their library, then
   stock or AI. `broll_qa.py --profile broll-led` checks the look instead:
   - `world`: one coherent world, with a spread across inserts of at most L* sd 14 and b* sd 5;
   - `models`: no posed stock models (a stranger's face of 8 % or more of the width);
   - `pace`: median shot 0.9-2.2 s;
   - `resolution`: 1080p or better.
   A Seoul list that failed did so on mismatched stock, not on stock as such.

Then:
- **Every shot shows its line** (section 0): if nothing shows it, leave the line bare.
- **One character per idea.** A parallel story keeps ONE person. Take the clips from one stock creator's series and
  check the frames: a "carpenter" that is 3 different men in 5 s reads as noise.
- **One shot per idea, not per noun.** A spoken list becomes typography (a stack, a drum, a word triptych), never three
  0.5 s clips.
- Every insert lasts at least 1.2 s.
- **Frame by default:** a PiP or phone card on the chest band, a polaroid on a page, or a top-half split, so the face
  stays on screen. Full screen is for the story's turn.

## 4. Grade conform (`scripts/insert_prep.py`)

The reference is THE SPEAKER'S PLATE AS SHOT (section 0, rule 2). In a reel with no face, use the main footage the
user handed over as `--ref`.

```bash
python3 $S/scripts/insert_prep.py SRC OUT.mp4 --in 3.5 --dur 2.0 --ref $P/assets/plate.mp4 [--size 1080x1920 --focus 0.5,0.45]
python3 $S/scripts/insert_prep.py --check SRC --in 3.5 --dur 2.0 --ref $P/assets/plate.mp4     # numbers only
```

One ffmpeg pass: cut, HDR to SDR, fps conform, a grade LUT, crop and scale, 1 s keyframes. `OUT.json` records what it
did and the before/after numbers. The grade (`grade_lib.py`) moves each stat just inside the QA band around the plate,
not all the way onto it:
- white balance: the median b*/a* of the 40 % least chromatic pixels. Sand, clouds, walls and skin highlights carry the
  light's colour; a blue sea does not. With the mean b* a real Seoul list failed 3 of 15 shots, with this 0.
- exposure: a gamma on L* (black and white stay put);
- contrast: half-way toward the plate's;
- saturation: chroma scaled around the plate's white point.

Clamps stop a night shot from being pushed to day. When the JSON says `fail: another world`, pick another shot. CSS
filters (`saturate()`, `sepia()`) on an insert are not a grade match.

Limits and options:
- **No neutral areas.** A shot that is all sky and sea, or all reef, has nothing neutral to measure white balance on.
  When its least-chromatic pixels still have a median chroma above 15, the conform moves white balance by at most 8 b*
  and the QA only warns. A lagoon read "25 b* cold", and the full shift turned its sky magenta.
- **`--sat-target 1.1`** for styles that lay big white type over the footage (Seoul list): the type lowers a frame's
  average chroma, so the inserts read about 0.1 lower in the render than they do when conformed.
- **`--strength 0.75`** keeps some of a shot's own colour, e.g. underwater footage next to a warm room.
- **Stills** (an AI still, a photo card): `insert_prep.py PHOTO.jpg OUT.jpg --ref <plate>`.

QA thresholds per insert:
- white balance |d b*| <= 8;
- exposure |d L*| <= 15;
- saturation x0.5-2.0.

The reel's MEDIAN insert saturation must also sit within x0.8-1.2. Per shot that band measures content, not grade: it
failed 11 of 15 shots of a well-graded Seoul list, whose median is x1.06. Mismatched stock had a median of x0.25-0.39.

## 5b. One fixed house look per style

Each recipe has `recipes/<style>/house.json`, and the build uses it instead of inventing a new look per reel. The look
is fixed; per reel only the content varies, plus a small variation inside each recipe's `vary_per_reel` list.
- **The look:** type, the caption system, the insert frame, the emphasis device, the signature word, the accent
  palette (one colour per reel, picked by topic), sound, and the speaker's face as shot.
- **Not the look: the components.** Phone-UI scenes, paper props, polaroid / card / collage treatments, transitions,
  hook and outro devices are new every reel: `scripts/components.py` and each recipe's `catalog.json`.
- **Not the grade of the speaker's face** (section 0, rule 2). The `grade` measured in house.json from each style's
  reference reel is reference data only: `house_look.py apply` refuses, and `broll_qa.py` check `as_shot` compares the
  speaker's frames in the render with the plate and fails a regrade (|L*| > 5, |b*| > 4, saturation outside
  x0.85-1.18, or a plate written by `house_look.py apply`).
- The recipes' SYSTEM.md "House look" sections keep the look fixed; the novelty rule is for the components only.

## 5. Motion and type

- **Captions:** at least 48 px; badges at least 60 px.
  - Contrast is at least 3:1 between the letters and the pixels right around them. An outline, a shadow or a pill
    counts; a soft glow on a light-grey hoodie does not.
  - Shoot captioned talking heads in a dark tee, or the caption gets a dark outline or pill.
- **Face-safe:** no card, panel or blur over any face, in the plate or in an insert.
  - A panel that opens from an icon carries its content from the first frame. An empty frosted box growing over the
    face for a few frames reads as a censored face.
  - Cards over stock footage stay off the stock person's head.
- A graphic scene changes state every 1-1.5 s (a count, a fill, a swap); a held static card is a slide.
- Typewriter text types at least at reading speed (~15 characters/s) and finishes 0.6 s before the card leaves.
- No board, map or card stays more than 60 % empty for more than 0.5 s.
- One text layer at a time: drop the caption while a label says the same thing.
- Décor text (notes, calendars, app names) is in the reel's language ("BUY MILK" on a note in a Spanish reel is wrong).

## 6. Style prerequisites (say so, and propose another style)

| style | needs | without it, propose |
|---|---|---|
| stan style | real screen recordings of the tool being explained | Clean OS (the idea as phone UI) or RESULT |
| cinematic doc | one consistent world of footage (own, or one stock series) | RESULT (framed stills) |

Check before planning. If the prerequisite is missing, say what is missing and offer the alternative. Don't fill the
gap with stock: a stan band filled with stock people is the known failure. Seoul list has no footage prerequisite: it is
a format (section 3, the B-roll-led exception).

## 7. Render hygiene

- **Plates:** keyframes every 1 s (`-g 30`; `prep.sh`, `recipes/clean-os/assemble.py`). HDR sources are tone-mapped to
  SDR BT.709 (iPhone HLG).
- **Inserts:** `insert_prep.py`. It never pads a clip past its end (a padded cafe tile froze for 1.4 s), retimes
  23.976/24/25 fps stock to 30 so every frame plays once (no judder), tone-maps HDR (one HLG clip switched a whole render
  to HLG), and puts a keyframe every 1 s.
- **Deliver** H.264 8-bit SDR BT.709. Check with `ffprobe -show_entries stream=color_transfer`.

## 8. Process

One reel at a time through `approval_sheet.py`. No batch renders of a wave without a sheet per reel: 7 styles rendered
from one template in 7 minutes came out with 0-2 approval files.

## 9. The QA (`scripts/broll_qa.py`)

```bash
python3 $S/scripts/broll_qa.py build/reel.mp4 --project $P [--profile talking-head|broll-led|graphics] [--words build/words.cut.json]
```

`render_report.py` runs it as part of the report, with the recipe's house look. Besides section 2's budgets it checks
stock inside a frame, own footage showing only the user, no posed stock models, 1080p sources, the people rules and the
line match (Gemini), the speaker's face as shot, and the components (`--style`); with `--profile broll-led` also one
world across the inserts and the shot pace. It writes `build/broll-qa.json`, with the checks and a metrics row, and
`broll-qa-timeline.png`.

With `--project` it reads the composition: which `<video>` is the plate and which are inserts. It then matches every
render frame against them (ORB features plus a similarity transform), which gives:
- which layer is on screen and how much of the frame it fills (full-screen vs framed);
- where each face in each layer lands, so a card or blur sitting on a face shows as a face region that no longer matches
  its source.

Other parts:
- The speaker is recognised with YuNet + SFace (cosine >= 0.40 to the plate's faces).
- Captions are read with macOS Vision text recognition (`ocr_text.js`, JXA through `osascript`; English and Russian):
  this part needs a Mac. A text line counts as a caption when its words were spoken within the last ~1.5 s.
- Size = line-box height / 0.93 (calibrated on renders with known CSS sizes).
- Speed: about 1-3 minutes for a 60 s reel on an Apple-silicon laptop, plus one Gemini call per B-roll shot the first
  time (cached after that).
