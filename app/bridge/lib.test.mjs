import { describe, expect, it } from "vitest";
import path from "node:path";
import { aboutText, brandDirs, clipBaseFor, DIRECT_FILE, editNote, findAgainEntry, libraryIndexText, libraryTarget, newOptions, parseCaptionJson, parseIdeas, safePart, scriptPrompt, shouldWriteAbout, statusFromEditor } from "./lib.mjs";

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
