/**
 * Caption styles you can pick per video. Each one is an instruction the editor follows; where the
 * editor has a matching CapCut preset (raw-media/capcut-pack/caption-presets.css + .js, rebuilt for
 * HyperFrames), the instruction names it so the look is exact, not guessed.
 * `packFont`: uses the pack's fonts, which are licensed for personal use only (fine for your own
 * videos; for paid client work buy the font licence or pick a style without the badge).
 */
export type CaptionPreset = { id: string; name: string; blurb: string; instruction: string; packFont?: boolean };

const PACK = "raw-media/capcut-pack/caption-presets.css (+ caption-presets.js for the animation, fonts in raw-media/capcut-pack/fonts)";

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "3d",
    name: "3D",
    blurb: "Chunky letters with a deep 3D extrusion",
    instruction:
      "3D captions: 1-3 words at a time, heavy rounded bold sans (e.g. Poppins Black), white face with a deep stacked 3D extrusion (6-10 layered text-shadows in a darker accent color) and a soft drop shadow, slight perspective tilt; each group pops in with a quick overshoot scale (0.6 → 1.08 → 1). Key word in the accent color.",
  },
  {
    id: "highlight",
    name: "Word highlight",
    blurb: "The spoken word lights up, Hormozi-style",
    instruction:
      "Word-highlight captions: 2-4 words on screen, bold all-caps sans with a black outline, the word being spoken gets a bright rounded highlight box (or turns the accent color) exactly in sync with the transcript word timings; small pop on each new group.",
  },
  {
    id: "pop",
    name: "Bold pop",
    blurb: "Orange Mytupi words thrown in",
    instruction: `Bold pop captions: the pack's .cp-orange preset with the throwIn animation (CapCut "Jogar fora") from ${PACK}. 1-3 words per beat, centered in the safe zone.`,
    packFont: true,
  },
  {
    id: "clean",
    name: "Clean glow",
    blurb: "Soft cream words that drift in",
    instruction: `Clean captions: the pack's .cp-clean preset with .cp-glow and the driftFade animation from ${PACK}; key words in .cp-clean-accent.`,
    packFont: true,
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Small, simple subtitles",
    instruction:
      "Minimal captions: one short line at a time, sentence case, clean medium-weight white sans with a subtle shadow, lower third inside the safe zone, simple 120 ms fade. No effects, no emojis.",
  },
  {
    id: "neon",
    name: "Neon",
    blurb: "Electric blue with glow",
    instruction: `Neon captions: the pack's .cp-blue preset with .cp-glow and the slideUp animation from ${PACK}; occasional .cp-water accents.`,
    packFont: true,
  },
  {
    id: "gold",
    name: "Gold",
    blurb: "Gold pop, money words in green script",
    instruction: `Gold captions: the pack's .cp-gold preset (pop) with a glow from ${PACK}; money / result words use .cp-money.`,
    packFont: true,
  },
  {
    id: "glitch",
    name: "Glitch",
    blurb: "Red blur-in with VHS flashes",
    instruction: `Glitch captions: the pack's .cp-error preset (blurIn + colorFlash) with occasional .cp-vhs words from ${PACK}. Use sparingly on punchlines; calmer lines in .cp-clean.`,
    packFont: true,
  },
  {
    id: "stack",
    name: "Big stack",
    blurb: "Huge two-line Poppins Black",
    instruction: `Big stack captions: the pack's .cp-aesthetic / .cp-striking two-line stack (Poppins Black, cream over red) from ${PACK}, for hooks and key statements; normal lines smaller underneath.`,
  },
  {
    id: "elegant",
    name: "Elegant",
    blurb: "Serif headline with script accents",
    instruction: `Elegant captions: the pack's .cp-principal (Abril Fatface) with .cp-style script accents and the bounceLeft / slideUp animations from ${PACK}. Slower pacing, more space.`,
    packFont: true,
  },
  {
    id: "typewriter",
    name: "Typewriter",
    blurb: "Letters type on with a cursor",
    instruction:
      "Typewriter captions: monospace white text that types on letter by letter in sync with speech, a blinking cursor at the end, short lines on a subtle dark pill.",
  },
  {
    id: "caps",
    name: "All caps",
    blurb: "Tall Bebas, slides in",
    instruction: `All-caps captions: the pack's .cp-bebas preset with .cp-glow and slideUp / slideDown from ${PACK}. Short punchy groups.`,
    packFont: true,
  },
];

export function captionPreset(id: string | null | undefined): CaptionPreset | null {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? null;
}
