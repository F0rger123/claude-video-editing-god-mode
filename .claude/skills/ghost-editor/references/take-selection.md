# Choosing takes from a multi-take recording

_Adapted from mariagorskikh/talking-head-reel (MIT, see UPSTREAM-LICENSE). In this skill the chosen takes go straight into `reel.json` → `takes`; there is no separate cut.py step._

People record the way people record: say a sentence, dislike it, say it
again, keep going when it lands, and restart the whole thing once they
have warmed up. So the recording is a script read two or three times
over, with the fluent versions towards the end, and the transcript table
is a map of it. The job is to pick one version of each sentence and lay
them back to back in script order.

## Procedure

1. Get the script the speaker meant to say (ask for it, or reconstruct it
   from the fullest take). Number its sentences.
2. Go down the whisper segment table and tag every segment with the
   sentence number it is a take of, or `x` for restarts, mutters ("okay,
   again"), and abandoned starts.
3. For each sentence, list its takes with their original seconds and pick:
   - the take that matches the script's meaning (not necessarily its
     words; the live wording is usually better);
   - fluent, no stumble inside the sentence, no filler the speaker would
     cut;
   - later over earlier, all else equal, because people warm up;
   - inside a run: when sentences 5, 6, 7, 8 come in one breath, take the
     run as one segment rather than the best of each, so the delivery
     stays continuous and there is one cut instead of four.
4. Splices from a different run are fine for one-liners (a joke, a call to
   action that landed only once) if the framing matches; the snap zoom at
   the cut hides small differences, a lighting change does not.
5. Cut points from WORD times (`transcribe.py`'s raw json, or `cut.py`'s
   table): `a` = first word start minus 0.10 to 0.15 s, `b` = last word end
   plus 0.20 to 0.30 s, never later than the start of the next spoken
   word. When a whisper word is suspiciously long (a "but" that lasts
   three seconds), the sound is somewhere inside it; find it with
   `ffmpeg -ss <t> -t <d> -i src -af silencedetect=noise=-32dB:d=0.25 -f null -`
   and start just before the last sound.
6. Pauses inside a take longer than about 1 s can be removed with a cut
   and a snap zoom. Pauses under 0.5 s stay; they are the speaker's
   rhythm.
7. Lines never said do not appear, not as captions, not as cards. If the
   script had a joke the speaker did not deliver, say so in the handover.
8. Glances are part of talking. Prefer the take with fewer real look-aways
   (eyes off the lens or closed for more than 0.5 s, the head turned or bowed
   more than 12 deg), but do not reject or hide a take for blinks, quick
   glances or small nods: they stay on screen. `cover_windows.py` /
   `plan_cut.py` label every off-lens window keep or cover. A cover window
   gets the cheapest fix: trim it, punch to the tight shot, hold the current
   graphic, a framed insert, full-screen stock last (references/broll.md 1).
   One audited reel hid all 31 of its flagged windows behind B-roll and UI; 29 of
   them were 0.03-0.4 s blips, and the speaker ended up on screen 33 % of the reel.

## When whisper smears a long raw take (a 5:38 raw with 8 hidden restarts)

On a long recording with many retakes, whisper over the whole file drifts: a word lasts 4-7 s, and
restarts vanish into one clean sentence. Neither Gemini's attempt log (its timestamps drifted ~15 s
by minute 4) nor the raw word table can be cut on. What worked:

1. Speech islands: `vad_pauses.py <raw or denoised audio> --min-pause 0.35 --out build/islands.json` (silero-vad v6, in the
   optional venv from `scripts/setup_audioqa.sh`). It works on the RAW camera audio too: on a 5:38 outdoor night take it
   found 51 islands on the raw and 49 on the denoised voice, missed no speech (whisper-checked), and returned none of the
   20-24 breath/cough/noise islands that `silencedetect -38 dB` produced on the denoised voice (whisper hallucinated
   a stock closing phrase, "To be continued...", on every one). On the raw audio silencedetect -38 dB returned ONE island: the night noise
   peaks sit above the threshold. `pauses[].kind == "sound"` marks a breath or click inside a pause. Without the venv:
   `silencedetect=noise=-38dB:d=0.35` on the denoised voice, and expect false islands.
2. Cut each island to its own wav (pad 0.1 s) and run whisper on all of them in ONE call (model loads once).
   Each island's text says which attempt it is (complete, abandoned, a fragment).
3. Islands that still look too long for their words, or a word lasting > 1 s: print a 10 ms RMS envelope
   (`#` > -30 dB, `+` > -40, `.` below) and split at the 0.1-0.3 s dips; transcribe the pieces. A restart
   ("but from the constant, but from the constant") shows up as a short first piece.
4. Refine each chosen take to the voice: onset/offset where RMS > -37 dB (-30 clips soft first words),
   `a` = onset - 0.07, `b` = offset + 0.12. A click before a line sits below -30 dB with a gap before the word.
5. Re-transcribe the assembled cut for captions; audit it with Gemini 2.5 Pro (it caught a leftover
   fragment and a mouth click), and check take tails in close-up frames: the eyes close right after
   the last word, so end within ~0.1 s of it.

## Worked example (a fictional recording)

The script, sentence by sentence:

1. One thing nobody tells you about launching on GitHub.
2. We shipped in three weeks. Two founders, one laptop, zero designers.
3. I thought nobody would care. Then fifty people signed up on day one,
   and they found us on Instagram, X and LinkedIn.
4. What I would do differently: post before you feel ready, talk to every
   user, ship the boring version first.
5. Link below. Cheers.

The transcript table shows two runs: 0:00 to 0:33 and 0:45 to 1:05, the
second one after an "okay, again". Picks:

| # | chosen (original s) | why | rejected |
|---|---|---|---|
| 1, 2, 3 | 10.0 - 33.0, one run | fluent, the numbers land, the platform names are in one breath | 0.9 - 9.2: sentence 1 said twice with a restart in the middle |
| 4, 5 | 48.0 - 65.0, one run | the complete close, ends on "Cheers" | 33.4 - 44.8: sentence 4 without its last item, then "okay, again" |

Result: 2 takes, 40 s of speech, 3 s frozen outro. That is the cut in
`assets/reel-segments.example.json` and the timeline in
`assets/Reel.example.tsx`; the word timings in `reel-words.json` are
spread evenly over each sentence, which real whisper output is not, so
expect real beats to need the transcript table, not a guess.
