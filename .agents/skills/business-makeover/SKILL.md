---
name: business-makeover
description: Edit an episode of a "business makeover" series such as "Spin the Wheel" (a local business gets a free Glow-Up - logo, website, Google profile, SEO). Builds the black-and-white digital whiteboard step board that adds each step as it is said, the before shots of the business's real site and Instagram, and the redesigned website mockup reveal. Use when the clip note says "Series: Spin the Wheel" or names a makeover series, mentions a STEP BOARD, or names a Glow-Up episode.
---

# business-makeover

The clip note carries everything: the script, `Step N: title: detail [show: ...]` lines, a website mockup brief
(headline, sections, colors), and the business's website and Instagram links. Follow the note; this skill says how
the series looks so every episode matches.

## Look (your channel's brand; default below)

- Black and white only. Pure black `#000`, pure white `#fff`, greys for secondary text. No accent colors, no neon,
  no glitch overload. Tasteful, premium, with a quiet terminal feel: monospace for labels and step numbers,
  thin 1-2 px lines, a blinking block cursor or typed-on text used once or twice per episode, not everywhere.
- Captions: clean white grotesk sans (Inter / Geist / Helvetica-style), sentence case, 2-5 words at a time, key word
  bold, a soft shadow or a thin black box; never colored, never emoji. Inside the 9:16 safe zone.
- Pace: calm. 60-120 s. Let each step breathe (3-8 s per step on the board). No rapid-fire cuts, no whooshes on
  every line. Punch zooms only on the key word of each step (add-zooms skill).
- Sound: subtle UI ticks when a step lands, one soft riser into the mockup reveal (real-sfx). No music unless the
  note asks.

## Structure

1. **Hook (0-3 s):** the wheel spin / the business name it lands on, spoken and on screen at once.
2. **Before:** the business's real website and Instagram, captured fresh:
   `node scripts/capture-site.mjs <website> <job>/captures/site` and the same for the Instagram
   link (if Instagram blocks the capture, use a clean card with the handle instead; never fake a screenshot).
   Show these at the words that name them, 2-3 s each, in a thin browser frame.
   **Screen recordings:** turn each full-page capture into a smooth scroll in HyperFrames (eased, about
   300-500 px/s, never jerky), inside the browser frame. At the problem the step talks about, ease to a stop,
   push in slightly, and draw a white hand-drawn arrow or circle onto it (stroke animates on in ~0.4 s). Follow
   each step's `[show: ...]` line for which page, where to scroll and what to point at. Then show the fix the
   same way (their new version), so every step is before, arrow, after.
   **Their branding:** use their logo and colors from the capture (`logo.png`, the page's colors) on the
   mockup and on the "after" shots; the step board itself stays in your channel's look (black and white by default).
3. **Step board:** a HyperFrames overlay, the digital whiteboard. One composition, reused for every step:
   - A panel (black, 1 px white border, 16-24 px radius) holding a checklist: `[01] New logo`, `[02] Website`, ...
   - When the speaker starts a step, the line types on (monospace number, sans title) and the board slides in
     beside or behind the speaker (head pop-out when the face-track allows; never over the face).
   - While the step is explained, show its `[show: ...]` visual (a capture, a before/after pair, a Google profile
     card, a search result mock) full screen or split; then return to the board with that step ticked (a white
     check, a strike-through of the old problem, or the line going from grey to white).
   - Each new step adds a line; earlier lines stay. The last step ends on the **full board**: the whole plan in
     one frame, held 2-3 s.
4. **Reveal:** the redesigned homepage mockup. Build it as a real page in HyperFrames from the brief (headline,
   sections, their brand colors and logo from the capture, their real photos if the capture has them), 9:16 and
   16:9 scrolls. Before/after: their current site then the new one, a clean wipe or crossfade, not a flashy
   transition. Label it "Concept" small in the corner.
5. **Close:** the soft call to action from the script ("Own a local business? Comment WHEEL / DM me to get on the
   wheel"), your handle, end.

## Rules

- Only show what is true: real captures of their real pages, findings as the script states them. No invented
  reviews, numbers or quotes. Be respectful: improvements, never mocking.
- Their logo, name and colors are theirs: use them only to show the concept for their business, as in the script.
- Say SEO, not AEO/GEO.
- In your reply list: the steps shown on the board with their time codes, captures used, the mockup sections, sounds
  (with sources), and anything skipped.
