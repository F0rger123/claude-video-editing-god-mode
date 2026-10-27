---
name: real-estate-styles
description: Edit real estate videos (listing tours, agent intros, "this house" reels) in one of seven studied looks - call hook, depth words, gradient 3D, fast tour, big numbers, agent talk, listing tour. First sorts every shot into agent-on-camera vs house B-roll, then cuts, ramps and titles each kind its own way. Use for any real estate client, or when the note names one of these looks or a reference from raw-media/styles/_references (group real-estate).
---

# real-estate-styles

References (measured in `raw-media/styles/_references/<id>/`, style.json + contact.jpg): @karly.closedit DX7G_a8SEhn,
@wayup_media DVG-5kdjvAi, @christianmediaclt DX68AkNxJEW, @aarynspoon DZyCwg9TABS and DcACrc9M3aB, @_k.elsie
DUk7BbqEXu3 and DXeU5dDkeXe. Copy structure, pace, type and motion; never their words, music, logos or the agents.

## 1. Sort the footage first

For every shot (scene detection, then look at a frame from each):
- **AGENT**: a person talking to camera or walking toward it (face visible, mouth moving, transcript words in that
  span). These carry the story and the captions.
- **HOUSE**: exteriors, interiors, drone, details with nobody talking. These carry the pace.
- **DETAIL**: close-ups (faucet, countertop, light fixture) - the fast cutaways.
Write the list to `work/shots.json` (start, end, kind, room/what) before editing.

## 2. Universal rules (all seven looks)

- Measured norms: 45-75 s long, 2.7-5.8 cuts per 10 s (median shot 1-2.5 s), first cut by 1.5-6 s, loudness about
  -14 LUFS. Vertical 9:16.
- **Hook in the first second**: the agent with a big title, or the best exterior with one.
- **House shots move**: wide-angle (16-14 mm look), every shot has motion (push, pull, orbit, gimbal walk). Join rooms
  with **speed ramps** (ramp to 4-8x with motion blur at the end of one shot, ramp down into the next) and **whip pans**
  in the direction of travel. No plain dissolves.
- Order: hook, exterior, entry, living, kitchen (details), primary bedroom and bath, extras (office, basement, view,
  dock), drone pull-out, end card (agent, brokerage, address or CTA). Cut details in 2-4 shot bursts.
- **Day-to-dusk** swap on the exterior when both exist (a flash or a fast ramp at the switch).
- Captions only on AGENT shots (unless the note says otherwise); HOUSE shots get sparse titles (room name, a number,
  a feature) or nothing.
- Sound: whooshes on ramps and whips, a soft riser into the reveal, one impact on the title. Licensed or no music.
- Text behind the agent ("depth"): cut the person out (rembg or a matte from the video) and layer big words between
  background and person. Check the edges on every frame.

## 3. The seven looks

| Look | Caption class (raw-media/caption-styles) | What defines it |
|---|---|---|
| call hook (@karly.closedit) | rc-twotone + rc-tiny | Two stacked heavy caps words (magenta/purple gradient over deep green) behind the house roof, an incoming-call pill overlay, "CALLING" in heavy white caps, a light-leak flash into a day-to-night exterior, then a fast wide tour; captions are tiny single words. |
| depth words (@wayup_media) | rc-depth + rc-depth-walk | Agent walks toward camera; thin Poppins lead-in + one huge ExtraBold word behind him; single italic words while he walks. Ramps between rooms, dusk exterior. |
| texture words (@christianmediaclt) | rc-texture | Huge Montserrat Black words filled with photos/gradients (water, lawn, sunset) and thin connector words, behind the agents; tilting drone, quick room cuts. |
| fast tour (@aarynspoon lake) | rc-red + rc-red-italic | 5.8 cuts / 10 s, median shot under 1 s. Tilted Anton words with a thin word and a red key word, bold italic follow-ups, drone dives, view and dock shots, branded end card. |
| big numbers (@aarynspoon new build) | rc-serif | Orange Playfair italic place names, navy serif small words, a huge photo-textured number per spec, behind the agent. Sunset grade, FPV drone, calm interiors (1.8 cuts / 10 s). |
| agent talk (@_k.elsie market) | rc-helv | Agent talking in many locations (jumps every 2-4 s); thin Inter lead-in over tight ExtraBold words, key words gradient-filled or flag/map textured, behind her. |
| listing tour (@_k.elsie listing) | rc-helv-reveal | Agent intro with white thin + bold words wiping in from a blur and a floating listing-price card, then a smooth wide-angle tour, aerial close. |

Pick the look the note names. If none: listing with an agent on camera = "listing tour"; agent-only market talk =
"agent talk"; no agent = "fast tour" pacing with "tiny-word" titles. Follow the client's brand kit colors where a look
uses accent colors.

## Reply

The shot list summary (agent vs house seconds), the look used, cuts per 10 s of the draft vs the reference, every
title and number shown, sounds and their sources.
