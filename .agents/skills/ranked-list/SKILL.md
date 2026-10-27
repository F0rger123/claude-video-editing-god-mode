---
name: ranked-list
description: Edit list videos where the speaker goes through numbered items, "10 types of X", a top 10 countdown, or a 0-10 rating/ranking of examples, with a numbered scale on screen and a picture for every item. Use when the clip note says FORMAT: Top 10 countdown, FORMAT: "10 types of …", FORMAT: Ranking, or the script came from those idea styles. (For S-to-F tiers use the tier-list skill.)
---

# ranked-list

Reference: @devinautomates, "What content formats get realtors leads" (instagram.com/p/DeLUJbAOfjY), measured in
`raw-media/styles/_references/DeLUJbAOfjY/`. One continuous talking-head take, 40 s, no cuts. Copy the structure
and motion, never their words or branding.

## Layout (9:16)

- **Speaker centered**, chest up, fills the frame (no split screen).
- **Scale on the left edge:** a thin vertical column of numbers 10 at the top to 0 at the bottom, each on a colored
  square: green at 10 through yellow and orange to red at 0 (or the brand colors, if the kit says so). About 6% of
  the frame wide, from 15% to 85% of the height.
- **Title, top center, first ~3 s:** two lines, white heavy condensed caps with a black shadow, one key word in an
  accent color (green in the reference; the brand's accent otherwise). Pops in, then goes away; it does not stay.
- **Captions:** ONE word at a time, white condensed caps (Bebas Neue / Anton style), centered just below the chin,
  thin black shadow. Every word on its beat.
- **End card:** last 3-4 s, the CTA as a big two-word title at the top ("COMMENT LIST"), the keyword in the accent
  color, with a soft glow.

## The motion

1. When an item is named, its example (a screenshot, photo or clip of that content type / product / house) pops in
   over the lower-middle of the frame at about 30% width (scale 0.7 to 1.0, 180 ms).
2. When the speaker gives its score or place, the picture shrinks and slides to the scale, parking next to that
   number as a small thumbnail (300 ms). Items stack beside their numbers for the rest of the video.
3. Countdown mode (top 10): the number for each spot appears big first (one beat), then the item; build to number 1
   with a short pause and a riser.
4. "Types of" mode: each type gets "#n" + its name as a label above the picture; cut straight to the next.
5. One stylized transition into the end card (a shatter / pixel break, ~300 ms) is allowed; everything else is cut.

## Pictures

Real screenshots or the client's own photos for every item (mentions tool:
`node scripts/capture-site.mjs <url> <out>`), or a clean title card with the item's name. Never
fake a screenshot, never AI images of real brands.

## Sound

Pop on each item, soft whoosh when it parks, riser before number 1. No music unless the note asks.

## Reply

List every item with its number or score and time code, the source of each picture, and anything skipped.
