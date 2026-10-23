# Deployment

`main` is production. Cloudflare Workers Builds (or `npm run deploy`) builds with OpenNext.

## 1. Supabase

1. Use a Supabase project (see "Which database" below).
2. Fill `.env.local` (URL, anon key, service role key, `SUPABASE_DB_URL`), then
   `npm run db:migrate` (needs Docker; applies each migration once, then the seed).
   Without Docker: run the migration files and `seed.sql` in order in the SQL editor.
3. Add your user (Authentication → Users → Add user), then
   `npm run db:migrate -- --owner you@example.com`.
4. Auth → URL configuration: Site URL = your app origin; add `<origin>/auth/callback` to redirect URLs.
   Disable public sign-ups (clients are invited).
5. Storage → `content-media` bucket: raise the file size limit for phone video (Pro plan).

**Which database.** Its own Supabase project, separate from your CRM's. Objects stay
`content_*`-prefixed so a later integration never collides with CRM tables.

## 2. Cloudflare Worker

Build variables (also runtime): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`.

Encrypted secrets: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `BUFFER_API_KEY`, optional
`ANTHROPIC_API_KEY`.

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET
npx wrangler secret put BUFFER_API_KEY
npm run deploy
```

`wrangler.jsonc` declares the `*/5 * * * *` cron; `worker.ts` turns it into a POST to `/api/cron/tick`.

## 3. Editing PC

Follow [bridge/README.md](../bridge/README.md). Keep the existing "Herk Edits Inbox" task.

## 4. Verify on the deployed app

1. Sign in → Settings shows Editor "Connected" within 5 minutes of the bridge running.
2. Clients → Studio HQ → Channels: map your Buffer channels.
3. Upload a short test clip to Studio HQ → it goes straight to Queued (full auto) → Editing →
   Review → Approved → post Scheduled in Buffer. Watch Today and the job's Activity.
4. Add a test client in Collaboration mode, invite a second email, upload from the portal, confirm
   it waits in Inbox and that the client sees nothing of Studio HQ or other clients.
