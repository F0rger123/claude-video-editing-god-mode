#!/usr/bin/env node
// Applies supabase/migrations/*.sql (once each, in order) and supabase/seed.sql to the project in
// SUPABASE_DB_URL (.env.local). Uses psql from the postgres:16 Docker image, so nothing extra is
// installed. Applied migrations are recorded in public.content_schema_migrations.
//
//   npm run db:migrate                         apply new migrations + seed
//   npm run db:migrate -- --owner you@x.com    also make that (already signed-up) user the owner
//   npm run db:migrate -- --dry-run            list what would run

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const ownerIdx = args.indexOf("--owner");
const owner = ownerIdx >= 0 ? args[ownerIdx + 1] : null;

const env = Object.fromEntries(
  (fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8") : "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const url = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is empty in .env.local (Project Settings → Database → Connection string → URI).");
  process.exit(1);
}

function psql(sql, { quiet = false } = {}) {
  const r = spawnSync("docker", ["run", "--rm", "-i", "postgres:16", "psql", url, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], { input: sql, encoding: "utf8" });
  if (r.error) throw new Error(`Docker is needed for psql: ${r.error.message}`);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).replace(url, "<db url>").trim());
  if (!quiet && r.stdout.trim()) console.log(r.stdout.trim());
  return r.stdout;
}

psql(`create table if not exists public.content_schema_migrations (name text primary key, applied_at timestamptz not null default now());
alter table public.content_schema_migrations enable row level security;
revoke all on public.content_schema_migrations from anon, authenticated;`, { quiet: true });
const applied = new Set(psql("select name from public.content_schema_migrations;", { quiet: true }).split(/\r?\n/).filter(Boolean));

const dir = path.join(ROOT, "supabase", "migrations");
const pending = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => !applied.has(f));
console.log(pending.length ? `Pending: ${pending.join(", ")}` : "Migrations up to date.");
if (dry) process.exit(0);

for (const file of pending) {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  // One transaction per migration: it applies completely or not at all.
  psql(`begin;\n${sql}\ninsert into public.content_schema_migrations (name) values ('${file}');\ncommit;`, { quiet: true });
  console.log(`Applied ${file}`);
}
psql(fs.readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"), { quiet: true });
console.log("Seed applied (Studio HQ workspace, full auto).");

if (owner) {
  if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(owner)) throw new Error("Invalid --owner email.");
  const out = psql(`insert into public.content_staff (user_id, role, display_name)
select id, 'owner', 'Owner' from auth.users where lower(email) = lower('${owner}')
on conflict (user_id) do update set role = 'owner'
returning user_id;`, { quiet: true });
  console.log(out.trim() ? `${owner} is now the owner.` : `No user ${owner} yet. Add it in Supabase → Authentication → Users, then rerun with --owner.`);
}
