#!/usr/bin/env node
// LOCAL self-audit of the main flows, driven like a person on a phone (Playwright) with the
// editor's part simulated through the database. Local Supabase + local dev server only.
//   node scripts/audit-flows.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = "http://localhost:3107";
const creds = JSON.parse(fs.readFileSync("supabase/.audit-users.json", "utf8"));
if (!/127\.0\.0\.1|localhost/.test(creds.url)) throw new Error("Local only.");
const db = createClient(creds.url, process.env.LOCAL_SUPABASE_SECRET, { auth: { persistSession: false } });
const ws = creds.workspace;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const tick = () => fetch(`${base}/api/cron/tick`, { method: "POST", headers: { authorization: "Bearer local-audit" } }).then((r) => r.json());

// Production builds open screens from the phone's stored copy first; wait for the live data.
function waitFresh(page) {
  const settle = () => page.waitForFunction(() => document.documentElement.dataset.fresh === "1", null, { timeout: 20000 }).catch(() => {});
  for (const name of ["goto", "reload"]) {
    const original = page[name].bind(page);
    page[name] = async (...args) => {
      const response = await original(...args);
      await settle();
      return response;
    };
  }
  return page;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
async function login(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = waitFresh(await ctx.newPage());
  page.on("pageerror", (e) => check(`no page errors (${who})`, false, e.message.slice(0, 120)));
  await page.goto(`${base}/login`);
  
  await page.locator('input[type="email"]').fill(creds[who].email);
  await page.locator('input[type="password"]').fill(creds[who].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Phones with a fingerprint get a one-time "Faster sign-in" offer; skip it here.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "Not now" }).click({ timeout: 30000 }).catch(() => {}),
  ]);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

// Fresh client idea quota for this run (earlier runs count against the monthly limit).
await db.from("content_idea_requests").delete().eq("workspace_id", ws);

// ── Owner: upload wizard ──
const owner = await login("owner");
await owner.goto(`${base}/upload`);
await owner.locator("select").first().selectOption({ label: "Audit Client" });
await owner.getByPlaceholder("Kitchen remodel before & after").fill("Audit deck reel");
await owner.getByRole("button", { name: "Next", exact: true }).click();
await owner.locator('input[type="file"]').first().setInputFiles(".audit/test-clip.mp4");
await owner.getByText("test-clip.mp4").waitFor();
await owner.getByRole("button", { name: "Next", exact: true }).click(); // → references
await owner.getByPlaceholder("One link per line").fill("https://www.instagram.com/reel/AUDIT123/");
await owner.getByRole("button", { name: "Next", exact: true }).click(); // → style
await owner.getByRole("button", { name: "Next", exact: true }).click(); // → posting
await owner.getByRole("button", { name: "Next", exact: true }).click(); // → check
await owner.getByRole("button", { name: "Upload video" }).click();
await owner.getByText(/Uploaded\./).waitFor({ timeout: 30000 });
const { data: job } = await db.from("content_jobs").select("*").eq("workspace_id", ws).eq("title", "Audit deck reel").order("created_at", { ascending: false }).limit(1).single();
check("upload creates one job for the video", Boolean(job));
check("manual client waits in Pending Approval", job?.status === "pending_approval", job?.status);
const { data: media } = await db.from("content_media").select("kind, role, storage_path, url").eq("job_id", job.id);
check("file + reference link attached to the job", media.length === 2 && media.some((m) => m.role === "primary") && media.some((m) => m.url), JSON.stringify(media.map((m) => m.kind)));
const stored = await db.storage.from("content-media").download(media.find((m) => m.storage_path).storage_path);
check("video really landed in storage", (stored.data?.size ?? 0) > 1000, `${stored.data?.size} bytes`);

// ── Owner: approve for editing from the job page ──
await owner.goto(`${base}/jobs/${job.id}`);
await owner.getByRole("button", { name: "Approve & edit" }).click();
for (let i = 0; i < 30; i++) {
  const { data } = await db.from("content_jobs").select("status").eq("id", job.id).single();
  if (data.status === "queued") break;
  await owner.waitForTimeout(500);
}
const { data: queued } = await db.from("content_jobs").select("status, queued_at").eq("id", job.id).single();
check("approve → Queued (quota counted)", queued.status === "queued" && Boolean(queued.queued_at), queued.status);

// ── Simulated editor: V1 arrives (what the bridge does) ──
const vpath = `${ws}/versions/${job.id}/v1.mp4`;
await db.storage.from("content-media").upload(vpath, fs.readFileSync(".audit/test-clip.mp4"), { contentType: "video/mp4", upsert: true });
const { data: v1 } = await db.from("content_versions").insert({ job_id: job.id, workspace_id: ws, number: 1, storage_path: vpath, description: "Option A: audit" }).select("id").single();
await db.from("content_jobs").update({ status: "review", review_stage: null, current_version_id: v1.id }).eq("id", job.id);
await tick();
const { data: routed } = await db.from("content_jobs").select("status, review_stage").eq("id", job.id).single();
check("tick routes the edit to agency review", routed.review_stage === "agency", JSON.stringify(routed));

// ── Owner: timestamped note + approve → goes to the client ──
await owner.goto(`${base}/jobs/${job.id}`);
await owner.getByRole("button", { name: "General note" }).click();
await owner.getByPlaceholder(/What should change overall/).fill("Keep the hook, tighten the end");
await owner.getByRole("button", { name: "Add note" }).click();
await owner.waitForTimeout(1500);
await owner.getByRole("button", { name: /Approve & send to client|Approve/ }).first().click();
await owner.waitForTimeout(3000);
const { data: atClient } = await db.from("content_jobs").select("status, review_stage").eq("id", job.id).single();
check("agency approval releases V1 to the client", atClient.review_stage === "client", JSON.stringify(atClient));

// ── Client: sees the draft, comments, approves ──
const client = await login("client");
await client.goto(`${base}/portal/audit-client/review/${job.id}`);
const sees = await client.locator("video").count();
check("client sees the released draft", sees > 0);
await client.getByRole("button", { name: "General comment" }).click();
await client.getByPlaceholder("What would you like changed or kept?").fill("Love it");
await client.getByRole("button", { name: "Add comment" }).click();
await client.waitForTimeout(1500);
await client.getByRole("button", { name: "Approve", exact: true }).first().click();
await client.getByText("Approved. Thank you!").waitFor({ timeout: 15000 });
const { data: approved } = await db.from("content_jobs").select("status").eq("id", job.id).single();
check("client approval → Approved", approved.status === "approved", approved.status);
const { data: internalSeen } = await (await (async () => {
  const c = createClient(creds.url, process.env.LOCAL_SUPABASE_PUBLISHABLE, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: creds.client.email, password: creds.client.password });
  return c;
})()).from("content_job_internal").select("*");
check("client cannot read agency-internal data", (internalSeen ?? []).length === 0);

// Client approval → the background pass plans the posts by itself.
await tick();
const { data: posts } = await db.from("content_posts").select("platform, status, scheduled_at, last_error").eq("job_id", job.id);
check("posts planned per platform with a slot", (posts ?? []).length > 0 && posts.every((p) => p.scheduled_at), JSON.stringify(posts?.map((p) => [p.platform, p.status])));
check("missing channel is reported, not silently posted", posts.every((p) => p.status !== "scheduled" && p.last_error), posts[0]?.last_error ?? "");

// ── Client: ideas with a monthly limit ──
await client.goto(`${base}/portal/audit-client/scripts`);
const before = await client.getByText(/idea requests left this month/).textContent();
await client.getByRole("button", { name: /Long-form/ }).click();
await client.getByRole("button", { name: "Story" }).click();
await client.getByRole("button", { name: /Write \d+ ideas/ }).click();
await client.getByText(/Claude is writing your ideas/).first().waitFor({ timeout: 15000 });
const { data: req } = await db.from("content_idea_requests").select("form, style, by_client, status").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(1).single();
check("client idea request saved with style + form", req.form === "long" && req.style === "Story" && req.by_client, `${before?.trim()} → ${JSON.stringify(req)}`);
// Simulate Claude finishing it (what the bridge does), so the next request is allowed.
await db.from("content_idea_requests").update({ status: "done" }).eq("workspace_id", ws).eq("status", "pending");
await db.from("content_workspaces").update({ idea_requests_per_month: 1 }).eq("id", ws);
await client.reload();
check("limit reached disables the buttons", await client.getByRole("button", { name: /Short-form/ }).first().isDisabled());
await db.from("content_workspaces").update({ idea_requests_per_month: 3 }).eq("id", ws);

// ── Client: swipe an idea ──
await client.goto(`${base}/portal/audit-client/scripts`);
const likeBtn = client.getByRole("button", { name: "Like", exact: true }).first();
if (await likeBtn.count()) {
  await likeBtn.click();
  await client.waitForTimeout(1500);
}
const { count: liked } = await db.from("content_script_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "liked");
check("swipe right saves a like", (liked ?? 0) >= 1, `${liked} liked`);

// ── Owner: library link + PC path ──
await owner.goto(`${base}/library`, { waitUntil: "networkidle" });
const addBtn = owner.getByRole("button", { name: "+ Add to library" });
if (await addBtn.count()) await addBtn.click();
await owner.getByRole("button", { name: "Link", exact: true }).click();
await owner.getByPlaceholder(/https:\/\/… \(a sound page/).fill("https://example.com/sfx/whoosh.wav");
await owner.getByRole("button", { name: "Add link" }).click();
await owner.getByText("Link added.").waitFor({ timeout: 10000 });
const { count: lib } = await db.from("content_library").select("id", { count: "exact", head: true }).eq("url", "https://example.com/sfx/whoosh.wav");
check("library link saved", (lib ?? 0) >= 1);

// ── Owner: calendar remembers the view ──
await owner.goto(`${base}/calendar?view=month`);
await owner.goto(`${base}/calendar`);
check("calendar reopens in the last view (month)", (await owner.locator("h2").first().textContent())?.includes("2026") && !(await owner.locator("h2").first().textContent())?.startsWith("Week"));
await owner.goto(`${base}/calendar?view=list`);
await owner.goto(`${base}/calendar`);
check("…and switches when changed (list)", (await owner.locator("h2").first().textContent())?.startsWith("From"));

// ── Login: show password ──
const anon = await browser.newPage();
await anon.goto(`${base}/login`);
await anon.locator('input[type="password"]').fill("abc");
await anon.getByRole("button", { name: "Show password" }).click();
check("show password reveals it", (await anon.locator('input[autocomplete="current-password"]').getAttribute("type")) === "text");
await anon.close();

// ── Owner: upload footage step has Photos + teleprompter with script & speed ──
await owner.goto(`${base}/upload`);
await owner.getByRole("button", { name: "Next", exact: true }).click();
check("Photos & videos picker offered", (await owner.getByRole("button", { name: /Photos & videos/ }).count()) === 1);
await owner.getByRole("button", { name: /Teleprompter/ }).click();
const prompter = owner.getByRole("dialog", { name: "Record with teleprompter" });
await prompter.waitFor({ timeout: 10000 });
check("teleprompter lets you choose a script and speed", (await prompter.locator("select").count()) === 1 && (await prompter.getByRole("button", { name: "Fast" }).count()) === 1);
await owner.waitForTimeout(1500);
check("teleprompter stays open (no random close)", await prompter.isVisible());
await prompter.getByRole("button", { name: "Close" }).click();

// ── Owner: add client wizard ──
await owner.goto(`${base}/clients/new`);
await owner.getByPlaceholder("Client / business name").fill(`Audit Wizard ${Date.now() % 10000}`);
for (let i = 0; i < 8; i++) await owner.getByRole("button", { name: "Next", exact: true }).click();
await owner.getByRole("button", { name: "Create client" }).click();
await owner.waitForURL(/\/clients\/[0-9a-f-]{36}\?created=1/, { timeout: 15000 }).then(() => check("add-client wizard creates the client", true)).catch(() => check("add-client wizard creates the client", false, owner.url()));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
