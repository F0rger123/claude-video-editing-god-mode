#!/usr/bin/env node
// Applies supabase/migrations/*.sql (once each, in order) and supabase/seed.sql to the project in
// SUPABASE_DB_URL (.env.local) with the `pg` driver (no Docker or psql needed). Applied migrations
// are recorded in public.content_schema_migrations.
//
//   npm run db:migrate                         apply new migrations + seed
//   npm run db:migrate -- --owner you@x.com    also make that (already signed-up) user the owner
//   npm run db:migrate -- --dry-run            list what would run

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const local = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.error(`Could not connect to the database: ${String(e.message).replace(url, "<db url>")}`);
  process.exit(1);
}

/** Runs SQL (several statements allowed). Returns the last statement's rows, one per line. */
async function run(sql, { quiet = false } = {}) {
  let res;
  try {
    res = await client.query(sql);
  } catch (e) {
    throw new Error(String(e.message).replace(url, "<db url>"));
  }
  const last = Array.isArray(res) ? res[res.length - 1] : res;
  const out = (last?.rows ?? []).map((r) => Object.values(r).join("|")).join("\n");
  if (!quiet && out.trim()) console.log(out.trim());
  return out;
}

try {
  await run(
    `create table if not exists public.content_schema_migrations (name text primary key, applied_at timestamptz not null default now());
alter table public.content_schema_migrations enable row level security;
revoke all on public.content_schema_migrations from anon, authenticated;`,
    { quiet: true },
  );
  const applied = new Set((await run("select name from public.content_schema_migrations;", { quiet: true })).split("\n").filter(Boolean));

  const dir = path.join(ROOT, "supabase", "migrations");
  const pending = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => !applied.has(f));
  console.log(pending.length ? `Pending: ${pending.join(", ")}` : "Migrations up to date.");

  if (!dry) {
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      // One transaction per migration: it applies completely or not at all.
      await run("begin;");
      try {
        await run(sql, { quiet: true });
        await client.query("insert into public.content_schema_migrations (name) values ($1)", [file]);
        await run("commit;");
      } catch (e) {
        await run("rollback;").catch(() => {});
        throw new Error(`${file}: ${e.message}`);
      }
      console.log(`Applied ${file}`);
    }
    await run(fs.readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"), { quiet: true });
    console.log("Seed applied (Studio HQ workspace, full auto).");

    if (owner) {
      if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(owner)) throw new Error("Invalid --owner email.");
      const { rows } = await client.query(
        `insert into public.content_staff (user_id, role, display_name)
select id, 'owner', 'Owner' from auth.users where lower(email) = lower($1)
on conflict (user_id) do update set role = 'owner'
returning user_id`,
        [owner],
      );
      console.log(rows.length ? `${owner} is now the owner.` : `No user ${owner} yet. Add it in Supabase → Authentication → Users, then rerun with --owner.`);
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
