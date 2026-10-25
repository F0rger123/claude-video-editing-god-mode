import { describe, expect, it } from "vitest";
import path from "node:path";
import { aboutText, brandDirs, brandKitFileName, brandKitLines, clipBaseFor, DIRECT_FILE, editNote, findAgainEntry, libraryIndexText, libraryTarget, newOptions, parseCaptionJson, parseIdeas, safePart, scriptPrompt, shouldWriteAbout, statusFromEditor } from "./lib.mjs";

describe("bridge ↔ drive-inbox contract", () => {
  it("uses the editor's folder layout", () => {
    const d = brandDirs("G:\\Drive", "Studio HQ");
    expect(d.short).toBe(path.join("G:\\Drive", "Studio HQ", "2 Upload Raw", "Short-form"));
    expect(d.again).toBe(path.join("G:\\Drive", "Studio HQ", "4 Rate", "Try again"));
    expect(path.dirname(d.jobFiles)).toBe(path.dirname(d.short)); // sibling, never scanned as a clip folder
  });
  it("clip names are unique per job and Windows-safe", () => {
    const base = clipBaseFor({ id: "12345678-aaaa-bbbb-cccc-000000000000", title: 'Kitchen: "before/after"?' });
    expect(base).toBe("Kitchen before after az-12345678");
    expect(safePart("a".repeat(100), 10)).toHaveLength(10);
  });
  it("never overwrites an About file the owner wrote", () => {
    expect(shouldWriteAbout(null)).toBe(true);
    expect(shouldWriteAbout("X\r\nTell the editor who these videos are for. Every edit…")).toBe(true);
    expect(shouldWriteAbout("My own careful notes")).toBe(false);
    expect(shouldWriteAbout(aboutText({ name: "D", brand_profile: {} }))).toBe(true);
  });
  it("note lists extra takes, B-roll and references for ONE video", () => {
    const note = editNote({
      job: { title: "Deck build", form: "short", platforms: ["instagram"], client_notes: "Show the stain" },
      ws: { name: "D" },
      media: [
        { role: "primary", kind: "video", localName: "take1.mp4" },
        { role: "source", kind: "video", localName: "take2.mp4" },
        { role: "source", kind: "broll", localName: "drone.mp4" },
        { role: "reference", kind: "link", url: "https://www.instagram.com/reel/x/" },
      ],
      extraDir: "G:\\x",
      agencyNotes: "Hook on the finished deck",
    });
    expect(note).toContain("take2.mp4: another take");
    expect(note).toContain("drone.mp4: B-roll");
    expect(note).toContain("https://www.instagram.com/reel/x/");
    expect(note).toContain("NEEDS-REVIEW.txt");
    expect(note).not.toContain("take1.mp4");
  });
  it("maps editor state to PWA status", () => {
    expect(statusFromEditor({ entry: undefined, inProgress: false })).toEqual({ status: "queued" });
    expect(statusFromEditor({ entry: { status: "running" }, hasNewRender: true })).toEqual({ status: "rendering" });
    expect(statusFromEditor({ entry: { status: "failed", attempts: 1 } })).toMatchObject({ status: "queued", retrying: true });
    expect(statusFromEditor({ entry: { status: "failed", attempts: 2 } })).toEqual({ status: "failed" });
    expect(statusFromEditor({ entry: { status: "running" }, paused: true })).toMatchObject({ paused: true });
  });
  it("finds new options and try-again entries", () => {
    const state = {
      outputs: { "c - Option A.mp4": { brand: "B", clip: "c", option: "A" }, "c - Option B.mp4": { brand: "B", clip: "c", option: "B" }, "x - Option A.mp4": { brand: "B", clip: "x", option: "A" } },
      jobs: { "again:G:\\f.mp4:1": { status: "running" }, "again:G:\\f.mp4:2": { status: "done" } },
    };
    expect(newOptions(state, "B", "c", ["c - Option A.mp4"]).map((o) => o.letter)).toEqual(["B"]);
    expect(findAgainEntry(state, "G:\\f.mp4")).toEqual({ status: "done" });
  });
  it("note carries script, style presets and Claude-decides picks", () => {
    const note = editNote({
      job: { title: "T", form: "short", style_choices: { notes: "moody" } },
      media: [],
      extraDir: "x",
      script: { hook: "3 deck mistakes", script: "Line one." },
      styles: [{ label: "Captions", name: "Bold yellow", instructions: "one word at a time", refs: ["cap.png"] }, { label: "Sound effects", auto: true }],
    });
    expect(note).toContain("3 deck mistakes");
    expect(note).toContain('Captions: "Bold yellow" — one word at a time (reference files: cap.png)');
    expect(note).toContain("Sound effects: your choice");
    expect(note).toContain("Look for this video: moody");
  });
  it("script prompt + parser match the app's", () => {
    expect(scriptPrompt({ workspaceName: "X", count: 5, history: [{ hook: "h", status: "passed", reason: "r" }] })).toContain("h — r");
    expect(parseIdeas('{"ideas":[{"hook":"a"}]}')).toHaveLength(1);
  });
  it("library: targets, direct links, index and picks in the note", () => {
    expect(libraryTarget("R", { kind: "sfx" }, null)).toBe(path.join("R", "Sound effects"));
    expect(libraryTarget("R", { kind: "overlay" }, "D-Hauss")).toBe(path.join("R", "Library", "Overlays", "D-Hauss"));
    expect(DIRECT_FILE.test("https://x.com/a/whoosh.wav?dl=1")).toBe(true);
    expect(DIRECT_FILE.test("https://freesound.org/people/x/sounds/123/")).toBe(false);
    expect(libraryIndexText([{ kind: "sfx", name: "Hit 01", synced_path: "R/Sound effects/Hit 01.wav", notes: "riser" }])).toContain("Hit 01: R/Sound effects/Hit 01.wav — riser");
    const note = editNote({ job: { title: "T" }, media: [], extraDir: "x", materials: [{ name: "Hit 07", kind: "sfx", path: "R/Hit 07.wav", notes: "deep boom" }], libraryIndex: "R/Library/LIBRARY.md" });
    expect(note).toContain("- Hit 07 (sfx): R/Hit 07.wav — deep boom");
    expect(note).toContain("R/Library/LIBRARY.md");
  });
  it("parses caption JSON per platform", () => {
    const out = parseCaptionJson('ok {"instagram":{"caption":"Hi","hashtags":["#a","b c"]},"bad":{}}');
    expect(out.instagram.hashtags).toEqual(["#a", "#bc"]);
    expect(out.bad).toBeUndefined();
  });
});

describe("brand kit in the edit note", () => {
  const kit = {
    logos: [{ name: "Alt logo", path: "R/Brand kit/logo/alt.png" }, { name: "Main logo", path: "R/Brand kit/logo/main.png", primary: true }],
    colors: [{ name: "Red", value: "#ef4444", primary: true }, { name: "Black", value: "#000000" }],
    fonts: [{ name: "Inter Bold", path: "R/Brand kit/font/inter.ttf" }],
    outros: [{ name: "End card", path: "R/Brand kit/outro/end.mp4", primary: true }],
  };
  it("lists the main logo first, colors with hex, fonts and outro", () => {
    const text = brandKitLines(kit).join("\n");
    expect(text).toMatch(/Logo: Main logo \(main\) — R\/Brand kit\/logo\/main.png; Alt logo/);
    expect(text).toContain("Brand colors: Red #ef4444 (main), Black #000000");
    expect(text).toContain("Fonts: Inter Bold");
    expect(text).toContain("End with it.");
  });
  it("says not to brand when switched off", () => {
    expect(brandKitLines(kit, false).join(" ")).toMatch(/do NOT apply/);
  });
  it("is part of the edit note, with the project brief", () => {
    const note = editNote({ job: { title: "T" }, media: [], extraDir: "x", brandKit: kit, project: { name: "Spring launch", brief: "Show the new showroom", refs: ["https://x.test/r"] } });
    expect(note).toContain("Project: Spring launch — Show the new showroom");
    expect(note).toContain("brand kit (use it");
    const off = editNote({ job: { title: "T", use_brand_kit: false }, media: [], extraDir: "x", brandKit: null });
    expect(off).toMatch(/do NOT apply/);
  });
  it("names kit files stably", () => {
    expect(brandKitFileName({ id: "abcdef123", kind: "logo", name: "Main logo!", file_name: "logo.png" }).replace(/\\/g, "/")).toBe("logo/Main logo!-abcdef.png");
  });
});

describe("edit time estimates", () => {
  it("uses the median of recent edits, within 5-90 minutes", async () => {
    const { typicalEditMs } = await import("./lib.mjs");
    const job = (min) => ({ status: "done", started: "2026-10-20T10:00:00Z", finished: new Date(Date.parse("2026-10-20T10:00:00Z") + min * 60e3).toISOString() });
    expect(typicalEditMs({ jobs: { a: job(10), b: job(30), c: job(14) } })).toBe(14 * 60e3);
    expect(typicalEditMs({ jobs: {} })).toBe(20 * 60e3);
    expect(typicalEditMs({ jobs: { a: job(200) } })).toBe(90 * 60e3);
  });
  it("queues videos one after another after the current edit", async () => {
    const { estimateEtas } = await import("./lib.mjs");
    const now = Date.parse("2026-10-25T12:00:00Z");
    const m = estimateEtas({ now, typicalMs: 20 * 60e3, current: { id: "cur", startedAt: now - 5 * 60e3 }, queued: ["q1", "q2"] });
    expect(m.get("cur").toISOString()).toBe("2026-10-25T12:15:00.000Z");
    expect(m.get("q1").toISOString()).toBe("2026-10-25T12:35:00.000Z");
    expect(m.get("q2").toISOString()).toBe("2026-10-25T12:55:00.000Z");
  });
  it("never promises less than 3 minutes for a running edit, and waits for a paused editor", async () => {
    const { estimateEtas } = await import("./lib.mjs");
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(estimateEtas({ now, typicalMs: 10 * 60e3, current: { id: "c", startedAt: now - 60 * 60e3 } }).get("c").toISOString()).toBe("2026-10-25T12:03:00.000Z");
    const later = now + 60 * 60e3;
    expect(estimateEtas({ now, typicalMs: 10 * 60e3, queued: ["q"], resumeAt: later }).get("q").toISOString()).toBe("2026-10-25T13:10:00.000Z");
  });
});

describe("edit note: references, colors, priority", () => {
  it("points the editor at downloaded references and says they win", () => {
    const note = editNote({ job: { title: "T" }, extraDir: "x", media: [{ kind: "link", url: "https://www.instagram.com/reel/X/", localPath: "C:/jobs/reference-1.mp4" }, { kind: "link", url: "https://tiktok.com/@a/video/1" }] });
    expect(note).toContain("REFERENCE VIDEOS");
    expect(note).toContain("C:/jobs/reference-1.mp4 (downloaded from https://www.instagram.com/reel/X/)");
    expect(note).toContain("https://tiktok.com/@a/video/1 (could not be downloaded");
  });
  it("lists the colors picked for this video and the priority rule", () => {
    const note = editNote({ job: { title: "T", style_choices: { colors: ["#ef4444", "nope", "#111111"] } }, media: [], extraDir: "x" });
    expect(note).toContain("Colors for this video (use exactly these for captions, highlights, titles and graphics): #ef4444, #111111.");
    expect(note).toMatch(/Following my notes for this video is never a reason to write NEEDS-REVIEW/);
  });
});
