import { describe, expect, it } from "vitest";
import { decideIntake, nextReviewStage } from "./automation";
import { buildInstructions, instructionsToNote } from "./feedback";
import { normalizePermissions, presetPermissions } from "./permissions";
import { decideQuota, periodStarts, type UsageCounts } from "./quota";
import { localDate, pickSlot, resolvePostTime, slotWarnings, zonedTimeToUtc } from "./schedule";
import { canTransition } from "./status";
import { composeText, copyProblems, normalizeHashtags, parseCopyJson } from "./captions";
import { ideaQuotaLeft, ideaRequestPrompt, parseFullIdeas, parseIdeas, scriptPrompt } from "./scripts";

const usage = (over: Partial<UsageCounts> = {}): UsageCounts => ({
  rawFiles: 20,
  shortJobsThisMonth: 0,
  longJobsThisMonth: 0,
  jobsThisWeek: 0,
  activeJobs: 0,
  deliverablesThisMonth: 0,
  publishedThisMonth: 0,
  ...over,
});

describe("quota", () => {
  it("raw files never count against the package", () => {
    const d = decideQuota({ short_per_month: 3 }, usage({ rawFiles: 500, shortJobsThisMonth: 2 }), { form: "short" }, "block");
    expect(d.outcome).toBe("ok");
  });
  it("applies overage behaviour", () => {
    const u = usage({ shortJobsThisMonth: 3 });
    expect(decideQuota({ short_per_month: 3 }, u, { form: "short" }, "block").outcome).toBe("blocked");
    expect(decideQuota({ short_per_month: 3 }, u, { form: "short" }, "warn").outcome).toBe("warn");
    expect(decideQuota({ short_per_month: 3 }, u, { form: "short" }, "require_owner_approval").outcome).toBe("needs_owner");
    expect(decideQuota({ short_per_month: 3 }, u, { form: "short" }, "allow_billable").outcome).toBe("billable");
  });
  it("long-form limit does not affect short-form", () => {
    expect(decideQuota({ long_per_month: 0 }, usage(), { form: "short" }, "block").outcome).toBe("ok");
  });
  it("simultaneous limit only waits for the owner, never bills", () => {
    expect(decideQuota({ max_simultaneous_jobs: 1 }, usage({ activeJobs: 1 }), { form: "short" }, "allow_billable").outcome).toBe("needs_owner");
  });
  it("revision rounds", () => {
    expect(decideQuota({ revision_rounds: 2 }, usage(), { form: "short", revisionRound: 2 }, "block").outcome).toBe("blocked");
    expect(decideQuota({ revision_rounds: 2 }, usage(), { form: "short", revisionRound: 1 }, "block").outcome).toBe("ok");
  });
  it("week starts Monday", () => {
    expect(periodStarts(new Date("2026-10-23T10:00:00Z"))).toEqual({ monthStart: "2026-10-01", weekStart: "2026-10-19", today: "2026-10-23" });
  });
});

describe("automation", () => {
  const base = {
    rules: {},
    form: "short" as const,
    source: "agency" as const,
    hasPrimaryVideo: true,
    hasReference: false,
    durationMinutes: 1,
    category: null,
    quota: { outcome: "ok" as const, issues: [] as [] },
  };
  it("manual always waits", () => {
    expect(decideIntake({ ...base, mode: "manual" }).next).toBe("pending_approval");
  });
  it("full auto queues agency uploads", () => {
    expect(decideIntake({ ...base, mode: "full_auto" }).next).toBe("queued");
  });
  it("client uploads need can_trigger_editing even in auto", () => {
    expect(decideIntake({ ...base, mode: "auto", source: "client", clientPermissions: presetPermissions("client_upload") }).next).toBe("pending_approval");
    const allowed = { ...presetPermissions("client_upload"), can_trigger_editing: true };
    expect(decideIntake({ ...base, mode: "auto", source: "client", clientPermissions: allowed }).next).toBe("queued");
  });
  it("conditional rules", () => {
    const d = decideIntake({ ...base, mode: "conditional", form: "long", rules: { short_form_only: true, max_duration_minutes: 0.5, require_reference: true } });
    expect(d.next).toBe("pending_approval");
    expect(d.reasons).toHaveLength(3);
    expect(decideIntake({ ...base, mode: "conditional", rules: { short_form_only: true, max_duration_minutes: 2 } }).next).toBe("queued");
  });
  it("blocked quota holds even full auto; billable passes and flags", () => {
    expect(decideIntake({ ...base, mode: "full_auto", quota: { outcome: "blocked", issues: [{ code: "weekly", message: "x" }] } }).next).toBe("pending_approval");
    const billable = decideIntake({ ...base, mode: "full_auto", quota: { outcome: "billable", issues: [{ code: "weekly", message: "x" }] } });
    expect(billable).toMatchObject({ next: "queued", billable: true });
  });
  it("no video holds", () => {
    expect(decideIntake({ ...base, mode: "full_auto", hasPrimaryVideo: false }).next).toBe("pending_approval");
  });
  it("review stage", () => {
    expect(nextReviewStage("full_auto", { edit_approval: false }, false)).toBeNull();
    expect(nextReviewStage("full_auto", { edit_approval: false }, true)).toBe("agency");
    expect(nextReviewStage("manual", { edit_approval: false }, false)).toBe("agency");
    expect(nextReviewStage("auto", { edit_approval: false, client_review: true }, false)).toBe("client");
    expect(nextReviewStage("auto", { edit_approval: true }, false)).toBe("agency");
  });
});

describe("status", () => {
  it("guards transitions", () => {
    expect(canTransition("pending_approval", "queued")).toBe(true);
    expect(canTransition("incoming", "published")).toBe(false);
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("published", "failed")).toBe(false);
    expect(canTransition("editing", "failed")).toBe(true);
    expect(canTransition("failed", "queued")).toBe(true);
  });
});

describe("permissions", () => {
  it("normalises unknown input to all-false", () => {
    const p = normalizePermissions({ can_upload: true, evil: true, can_approve: "yes" });
    expect(p.can_upload).toBe(true);
    expect(p.can_approve).toBe(false);
    expect("evil" in p).toBe(false);
  });
  it("collaboration includes scripts; upload-only does not", () => {
    expect(presetPermissions("client_collab").can_swipe_scripts).toBe(true);
    expect(presetPermissions("client_upload").can_view_scripts).toBe(false);
  });
  it("agency-only grants nothing", () => {
    expect(Object.values(presetPermissions("agency_only")).every((v) => v === false)).toBe(true);
  });
});

describe("schedule", () => {
  const tz = "America/New_York";
  it("converts wall clock across DST", () => {
    expect(zonedTimeToUtc("2026-07-01", "09:00", tz).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "09:00", tz).toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("picks the first window slot after now", () => {
    const at = pickSlot({ rules: { windows: [{ start: "09:00", end: "11:00" }] }, timezone: tz, platform: "instagram", existing: [], now: new Date("2026-10-23T08:00:00Z") });
    expect(at?.toISOString()).toBe("2026-10-23T13:00:00.000Z");
  });
  it("respects min gap, max per day, preferred days and blackouts", () => {
    const rules = { windows: [{ start: "09:00", end: "10:00" }], min_gap_minutes: 120, max_posts_per_day: 1, preferred_days: [1, 3, 5], blackout_dates: ["2026-10-26"] };
    const existing = [{ at: new Date("2026-10-23T13:00:00Z"), platform: "instagram" }];
    // Fri 23 taken (max 1/day) → Sat/Sun not preferred → Mon 26 blackout → Wed 28.
    const at = pickSlot({ rules, timezone: tz, platform: "instagram", existing, now: new Date("2026-10-23T08:00:00Z") });
    expect(localDate(at!, tz)).toBe("2026-10-28");
  });
  it("platform rules override", () => {
    const at = pickSlot({
      rules: { windows: [{ start: "09:00", end: "10:00" }], platform_rules: { youtube: { windows: [{ start: "15:00", end: "16:00" }] } } },
      timezone: tz,
      platform: "youtube",
      existing: [],
      now: new Date("2026-10-23T08:00:00Z"),
    });
    expect(at?.toISOString()).toBe("2026-10-23T19:00:00.000Z");
  });
  it("caps posts per week per platform", () => {
    const existing = [{ at: new Date("2026-10-20T14:00:00Z"), platform: "instagram" }]; // Tue
    const at = pickSlot({ rules: { windows: [{ start: "09:00", end: "10:00" }], max_posts_per_week: 1 }, timezone: tz, platform: "instagram", existing, now: new Date("2026-10-23T08:00:00Z") });
    expect(localDate(at!, tz)).toBe("2026-10-26"); // next Monday
  });
  it("post timing: after edit, fixed daily time, explicit time", () => {
    const now = new Date("2026-10-23T13:00:00Z"); // 9:00 New York
    const base = { rules: {}, timezone: tz, platform: "instagram" as const, existing: [], now };
    expect(resolvePostTime({ ...base, timing: "after_edit" })?.toISOString()).toBe("2026-10-23T13:20:00.000Z");
    expect(resolvePostTime({ ...base, timing: "fixed", dailyTime: "12:00" })?.toISOString()).toBe("2026-10-23T16:00:00.000Z");
    const at = new Date("2026-10-30T20:00:00Z");
    expect(resolvePostTime({ ...base, timing: "fixed", fixedAt: at })).toEqual(at);
  });
  it("warns on manual overrides that break rules", () => {
    const w = slotWarnings({ rules: { blackout_dates: ["2026-10-23"] }, timezone: tz, platform: "instagram", existing: [] }, new Date("2026-10-23T15:00:00Z"));
    expect(w).toContain("This is a blackout date.");
  });
});

describe("feedback → editor note", () => {
  it("structures timestamped, general, keep and references", () => {
    const i = buildInstructions(
      [
        { body: "Caption covers my face", at_seconds: 12.4, reference_url: null, author_label: "Owner", internal: false },
        { body: "Keep the hook", at_seconds: null, reference_url: null, author_label: "Owner", internal: false },
        { body: "Faster cuts like https://www.instagram.com/reel/abc/.", at_seconds: null, reference_url: null, author_label: "Client", internal: false },
        { body: "Logo earlier", at_seconds: 3, reference_url: null, author_label: "Owner", internal: false },
      ],
      { round: 1, fromVersion: 1 },
    );
    expect(i.timestamped.map((t) => t.at)).toEqual(["0:03", "0:12"]);
    expect(i.keep).toEqual(["Keep the hook"]);
    expect(i.references).toEqual(["https://www.instagram.com/reel/abc/"]);
    const note = instructionsToNote(i);
    expect(note).toContain("At 0:12: Caption covers my face");
    expect(note).toContain("Keep as it is:");
  });
});

describe("captions", () => {
  it("normalises hashtags", () => {
    expect(normalizeHashtags("#seo, local seo  #SEO ##web-design")).toEqual(["#seo", "#local", "#SEO", "#webdesign"]);
  });
  it("validates platform limits", () => {
    const copy = { caption: "x".repeat(300), hashtags: [], cta: null, title: null, description: null };
    expect(copyProblems("twitter", copy)[0]).toMatch(/Too long/);
    expect(copyProblems("youtube", copy)).toContain("YouTube needs a title.");
    expect(composeText("instagram", { ...copy, caption: "Hi", hashtags: ["#a"], cta: "Book now" })).toBe("Hi\n\nBook now\n\n#a");
  });
  it("parses model JSON", () => {
    expect(parseCopyJson('Sure: {"caption":"Hello","hashtags":["seo"],"cta":null,"title":null,"description":null}')?.hashtags).toEqual(["#seo"]);
    expect(parseCopyJson("no json")).toBeNull();
  });
});

describe("script ideas", () => {
  it("prompt carries likes and pass reasons so Claude learns", () => {
    const p = scriptPrompt({
      workspaceName: "D-Hauss",
      brand: { about: "Remodeling" },
      count: 5,
      history: [
        { hook: "3 mistakes in kitchen remodels", status: "liked", form: "short" },
        { hook: "You are wasting money", status: "passed", reason: "too negative", form: "short" },
      ],
    });
    expect(p).toContain("3 mistakes in kitchen remodels");
    expect(p).toContain("too negative");
    expect(p).toContain("4 short-form");
  });
  it("full idea requests carry style, topic and form", () => {
    const p = ideaRequestPrompt({ workspaceName: "D", brand: {}, form: "long", style: "Story", topic: "decks", count: 3, history: [] });
    expect(p).toContain("long-form YouTube");
    expect(p).toContain("Style: Story");
    expect(p).toContain("Topic or angle requested: decks");
    const ideas = parseFullIdeas('{"ideas":[{"title":"T","hook":"H","script":"S","outline":"1. a","broll":"b","thumbnail_text":"TT","caption":"C"}]}', "long", "Story");
    expect(ideas[0]).toMatchObject({ title: "T", outline: "1. a", thumbnail_text: "TT", form: "long", style: "Story" });
    const lines = parseFullIdeas('{"hook":"One","script":"a"}\n{"hook":"Two","script":"b"}\n{"hook":"Thr', "short", "Story");
    expect(lines.map((i) => i.hook)).toEqual(["One", "Two"]); // streamed: complete lines only
    expect(ideaQuotaLeft(5, 4)).toBe(0);
    expect(ideaQuotaLeft(1, 4)).toBe(3);
  });
  it("bridge prompts stay identical to the app's", async () => {
    // Plain JS module shared with the editing PC.
    const bridge = (await import("../../../bridge/lib.mjs")) as unknown as { ideaRequestPrompt: (i: unknown) => string; scriptPrompt: (i: unknown) => string };
    const input = { workspaceName: "D", brand: { about: "a", voice: "v" }, form: "long" as const, style: "Story", topic: "t", count: 3, history: [{ hook: "h", status: "passed" as const, reason: "r", form: "short" as const }] };
    expect(bridge.ideaRequestPrompt(input)).toBe(ideaRequestPrompt(input));
    expect(bridge.scriptPrompt({ workspaceName: "D", brand: {}, count: 4, history: input.history })).toBe(scriptPrompt({ workspaceName: "D", brand: {}, count: 4, history: input.history }));
  });
  it("parses ideas defensively", () => {
    const ideas = parseIdeas('Here: {"ideas":[{"form":"long","hook":"Why decks rot","script":"…"},{"hook":""},{"nope":1}]}');
    expect(ideas).toHaveLength(1);
    expect(ideas[0].form).toBe("long");
    expect(parseIdeas("no json")).toEqual([]);
  });
});
