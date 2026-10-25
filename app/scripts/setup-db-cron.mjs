#!/usr/bin/env node
// Makes the database call the app's background pass every 2 minutes (Supabase pg_cron + pg_net), so
// posting (Instagram at its exact time, YouTube/Buffer tracking) keeps going while the editing PC is off.
// CRON_SECRET is copied from .env.local into Supabase Vault (encrypted), never into SQL files or git.
//
//   node scripts/setup-db-cron.mjs            set up or update
//   node scripts/setup-db-cron.mjs --remove   stop it

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const APP_URL = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (!APP_URL) {
  console.error("Set APP_URL (or NEXT_PUBLIC_SITE_URL) in .env.local to your deployed app URL, e.g. https://cut.yourdomain.com");
  process.exit(1);
}
if (!env.SUPABASE_DB_URL || !env.CRON_SECRET) {
  console.error("SUPABASE_DB_URL and CRON_SECRET must be set in .env.local.");
  process.exit(1);
}

const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  if (process.argv.includes("--remove")) {
    await db.query("select cron.unschedule(jobid) from cron.job where jobname = 'azc-tick'");
    console.log("Stopped: the database no longer calls the background pass.");
  } else {
    await db.query("create extension if not exists pg_cron");
    await db.query("create extension if not exists pg_net");
    const { rows } = await db.query("select id from vault.secrets where name = 'azc_cron_secret'");
    if (rows.length) await db.query("select vault.update_secret($1, $2)", [rows[0].id, env.CRON_SECRET]);
    else await db.query("select vault.create_secret($1, 'azc_cron_secret', 'Bearer token for /api/cron/tick')", [env.CRON_SECRET]);
    const command = `select net.http_post(
      url := '${APP_URL}/api/cron/tick',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'azc_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 290000
    )`;
    await db.query("select cron.schedule('azc-tick', '*/2 * * * *', $1)", [command]);
    console.log(`Done: the database calls ${APP_URL}/api/cron/tick every 2 minutes.`);
  }
} finally {
  await db.end();
}
