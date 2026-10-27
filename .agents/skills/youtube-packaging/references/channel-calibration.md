# Channel Calibration — replacing inherited rules with measured ones

**This file ships empty on purpose. It's a worksheet, not a dataset.**

The rules in `SKILL.md` are not generic YouTube advice. They were derived from YouTube Studio CTR
data across 20 long-form videos on a real, beginner-focused AI/how-to channel with ~1M subscribers —
a CTR-ordered read of what actually got clicked and what didn't.

**That channel's dataset is not shipped here, deliberately.** It's someone else's numbers and someone
else's titles, and its absolute values would not transfer to your channel anyway — a "good" CTR on a
1M-sub browse-heavy channel is a different number than on a 2K-sub search-heavy one. What *does*
transfer is the **pattern set**: which levers move CTR, which framings reliably sink it. Those are in
`SKILL.md` and you can use them today.

This file is how you go from *inherited patterns* to *your own measured ones*.

---

## Which mode are you in?

**Cold start — fewer than ~10 long-form videos, or no Studio access.**
Skip this file. `SKILL.md`'s rules apply as-is; they are a sensible prior, not a guess. The skill will
tell you it's uncalibrated when it packages. Start logging CTR from your very first video — by video
10 you can come back and do this properly. Do **not** calibrate off 3 videos; you'd be fitting noise.

**Calibrated — ~10+ long-form videos with CTR.**
Do the pass below. Then `SKILL.md` gets recalibrated to *your* audience, and the packaging targets
your real baseline instead of a norm.

---

## Step 1 — Get CTR out of YouTube Studio (manual, and there's no way around it)

**Impression CTR is not in the YouTube Analytics API.** It is Studio-only. `tools/yt_stats.py` pulls
views, watch time, average view percentage and subs gained via OAuth — but `impressionClickThroughRate`
returns a 400 and is documented as unavailable (see the note at the top of `tools/yt_stats.py`). Any
tool claiming to automate this is either screen-scraping Studio or guessing.

So this is a ten-minute manual job, once:

1. YouTube Studio → **Analytics** → **Content**.
2. Set the date range wide enough to cover 10–20 long-form uploads (Lifetime is fine).
3. Add the **"Impressions click-through rate"** column if it isn't shown.
4. **Sort by most recent — not by most popular.** This matters more than it sounds: a
   popularity-sorted list hides your flops, and *the flops carry the most packaging signal*. A
   dataset of only winners teaches you nothing about what sinks a title.
5. **Exclude Shorts.** Different packaging game entirely; mixing them corrupts the baseline.
6. Copy the rows into the table below.

## Step 2 — Fill in the table

Sort **by CTR, descending**. That ordering is the whole point — it lines patterns up against
click-rate so they're visible.

```markdown
**Analysis date:** <month year>
**Channel:** <subs>, <what your channel is about>
**Sample:** <N> long-form videos, CTR from YouTube Studio. Shorts excluded.

| CTR | Views | Title |
|----:|------:|-------|
| —   | —     | (your highest-CTR video) |
| —   | —     | … |
| —   | —     | (your lowest-CTR video) |
```

## Step 3 — Derive your numbers

- **Baseline = the median CTR of the set** (median, not mean — one viral outlier shouldn't move it).
  This replaces every "aim for X%" in `SKILL.md`. Beat your own median; stretch target is roughly
  your top quartile.
- **Floor and ceiling** — lowest and highest in the set. Your realistic range.
- **Top tier** = the top ~25%. **Flop tier** = the bottom ~25%. These two lists are the evidence.

For context only: mid-single-digit CTR is typical for browse-blended traffic on established
channels, but the spread by niche, channel size, and traffic source is enormous. **Your own median is
the only number that means anything.** Never benchmark against another channel's CTR, including the
one these rules came from.

## Step 4 — Read the patterns off your own data

For every video in the set, label the **lever** its title pulled (magnet word, number/$, barrier
drop, enemy kill, news ride, own-term, vague curiosity, hot take) and what its thumbnail did (one
hook vs busy; expression; color; object).

Then answer, from your table:

1. **Which levers cluster in your top tier?** Those are your confirmed levers.
2. **Which cluster in your flop tier?** Those are your confirmed anti-patterns.
3. **Any within-topic pair?** Two videos on the *same topic* with different packaging is the cleanest
   evidence you will ever get, because topic is held constant and only packaging varies. If you have
   one, it outweighs ten cross-topic comparisons.
4. **Where do you disagree with `SKILL.md`?** Your data wins. Note the disagreement explicitly.

**A labeled contact sheet makes this ~5x easier.** Build one image: every thumbnail, sorted
CTR-descending, each labeled with its CTR and views (ImageMagick `montage`, or PIL). Then *look at
it*. Visual patterns that are invisible in a table jump out when the frames are ordered by click-rate.

Get the thumbnails by uploading them, or from `https://i.ytimg.com/vi/<VIDEO_ID>/maxresdefault.jpg`.
*Gotcha:* sandboxed egress often blocks `i.ytimg.com` (`host_not_allowed`), and a running session
won't pick up an allowlist change mid-flight — uploading the images is usually faster than fighting it.

## Step 5 — Reconcile back into SKILL.md

Calibration is only real if the rules change. Edit `SKILL.md` directly:

- Replace the baseline/target language with your measured median and top quartile.
- Re-order the **Title Checklist** and **Thumbnail Checklist** so your strongest levers rank first.
- Add any pattern your data shows that isn't in there. **Delete or demote any rule your data
  contradicts** — an inherited rule that your audience disproves is worse than no rule.
- Record your evidence in this file (dataset + the tier lists), so the next refresh can see drift.
- Update the analysis date here.

Re-run when the catalog grows materially or after a strategy shift — every few months, roughly.

---

## Caveats to keep honest (they applied to the source data, and they'll apply to yours)

- **~20 data points is directional, not lawful.** These are patterns to bet on, not physics.
- **Topic is confounded with packaging style.** Broad money/free topics also tend to attract the
  boldest thumbnails, so you usually can't separate "bold frame" from "wanted topic". Only a
  same-topic pair isolates packaging cleanly.
- **No traffic-source split.** Studio CTR is browse/suggested/search blended, and the same thumbnail
  pulls wildly different CTR per surface and per audience temperature. Treat absolutes as context.
- **Survivorship.** If you build the list from search or from "most popular", you'll capture your
  winners and learn nothing. The recency-sorted Studio export is the honest spread.
- **CTR isn't the goal, it's the lever.** A title that wins the click and loses the viewer at 0:30
  chokes the reach it bought. See the honesty guardrail in `SKILL.md`.
