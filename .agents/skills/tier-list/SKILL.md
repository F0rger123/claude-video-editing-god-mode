---
name: tier-list
description: Edit a "tier list" video, where the speaker ranks things (tools, tactics, products, houses, anything) from S tier down to F tier while a tier board fills up on screen with a picture of each item. Use when the clip note says FORMAT: Tier list, mentions a tier list / S tier / ranking things into tiers, or the script came from the "Tier list (S to D)" idea style.
---

# tier-list

Reference: @bodhigallo, "Ranking free local trust signals" (instagram.com/p/Dd30vAhivDq), measured in
`raw-media/styles/_references/Dd30vAhivDq/` (style.json + contact.jpg). One continuous talking-head take, no cuts,
35 s, -14 LUFS. The board does all the visual work. Copy the structure and motion, never their branding or words.

## Layout (9:16)

- **Top ~42%: the speaker**, framed head and shoulders, face centered horizontally, eyes around 22% from the top.
  If the source is wider, crop and scale so the face sits in that band (use the face-track JSON).
- **Title, top center:** two lines in white boxes with tight black heavy condensed caps (e.g. "RANKING FREE LOCAL" /
  "TRUST SIGNALS"). Unlike the reference, it **pops in** (scale 0.8 to 1.05 to 1.0, 250 ms, with a soft pop SFX)
  in the first 0.2 s, holds about 2.5 s, then **pops out** (scale down + fade, 200 ms). Not on screen the whole time.
- **Captions** sit in the gap between chin and board (about 46% down): 2-4 words, white bold italic sans with a
  thin black stroke, the key word in **yellow**. One line, no box.
- **Tier board, bottom ~52%:** six rows, S A B C D F. Each row: a square label on the left (S red #E53935,
  A orange #FB8C00, B yellow #FDD835, C light green #9CCC65, D green #43A047, F dark green #2E7D32; white or black
  letter, whichever reads) and a dark charcoal row (#2A2A2A, 1 px darker gaps). Board width about 70% of the frame,
  centered, small radius. Use the brand's colors for the labels only if the brand kit says so; otherwise these.

## The motion that makes it work

1. When the speaker **names an item**, its picture appears **big over the board** (about 40% of the board width,
   centered), pops in (scale 0.6 to 1.08 to 1.0, 200 ms) with a subtle shadow.
2. It holds while they explain it (1-3 s).
3. When they **say the tier** ("S tier", "probably B tier"), it **flies and shrinks** into that row (350 ms, ease-out),
   landing as a small square icon to the right of the items already there. A soft click SFX on landing.
4. Items stay on the board for the rest of the video; the board fills up. End on the full board (hold 1 s).

## Pictures for each item

- Logos and brands: capture them with `node scripts/capture-site.mjs <domain> <out>` (logo.png),
  or the brand's own app icon. Real places, products or houses: the client's photos from the job files first, then a
  real screenshot of the thing. Never an AI-generated picture of a real brand; never a random stock photo
  pretending to be something specific.
- Square, rounded corners, same size for every item.

## Pace and sound

- Talking head stays continuous; cut only dead air and mistakes (cut-silences / cut-mistakes). No B-roll cutaways:
  the board is the B-roll.
- SFX: pop on each item appearing, soft click on each landing, nothing else. No music.
- Captions follow the brand's caption style when one is locked; otherwise the style above.

## Reply

List each item with the tier it landed in and its time code, where each picture came from, and anything skipped.
