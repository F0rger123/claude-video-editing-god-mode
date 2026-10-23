# Example Brand captions (LOCKED, approved by the owner on 2026-10-18)

Use this caption style for every video for this brand unless the owner's note for a clip says otherwise.

- Font: Inter Bold 700 (raw-media/fonts/Inter-VF.ttf), 84px at 1080x1920, letter-spacing -2.5px, line-height 1.05.
- No pill, no box, no outline. Sentence case as spoken. 1-3 words per caption, max ~16 characters.
- One key word per caption (the word that carries the point) in Playfair Display Bold Italic
  (raw-media/fonts/PlayfairDisplay-Italic-VF.ttf), 92px, blue.
- Karaoke reveal: all words of the caption appear dim (opacity 0.28), each word turns solid as it is spoken
  (0.08 s fade, 0.03 s before the word starts). Caption enters with a small 14px rise, 0.14 s, power3.out.
- Color by background:
  - over light UI / paper pages: text #111418, key word #1E6FFF, no shadow;
  - over footage (face, punch-in, head pop-out): text #FFFFFF, key word #6FB2FF, shadow 0 4px 22px rgba(0,0,0,0.6).
- Placement: centered, between the graphic and the head (in the pop-out layout, low on the footage panel).
- Titles (hook and section titles) match: line 1 Inter Bold, line 2 Playfair Bold Italic, white, on a #1877F2 box
  with 6px corners.
- Exact CSS: raw-media/styles/<brand-slug>/captions.css.
