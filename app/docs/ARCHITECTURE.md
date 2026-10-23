# Architecture

## Stack

Next.js 16 App Router + TypeScript, Tailwind 4, Supabase (`@supabase/ssr`), OpenNext on
Cloudflare Workers, Vitest. No new infrastructure: one Worker (with a 5-minute cron trigger), one
Supabase project, Buffer, and the editing PC that already runs the Herk Edit Kit.

## Code map

| Path | What |
| --- | --- |
| `src/lib/domain/` | Pure rules, no I/O, unit-tested: statuses + transitions, permissions, quota accounting, automation (intake), slot picker, feedback → editor instructions, caption limits |
| `src/lib/workflow.ts` | Workflow engine: intake, approve for editing, review routing, approvals, revisions, post planning, Buffer send/track, `tick()` |
| `src/lib/integrations/` | Adapters: `buffer.ts` (PublishingAdapter + Buffer GraphQL), `storage.ts`, `captions.ts`, `notify.ts` (delivery channels) |
| `src/app/(staff)/` | Agency screens: Today, Inbox, Upload, Calendar, Clients, Jobs (review), Notifications, Settings |
| `src/app/portal/[slug]/` | Client portal: Home, Upload, Review, Calendar |
| `src/app/api/cron/tick` | Background pass (Worker cron + bridge) |
| `worker.ts` | Cloudflare entry: OpenNext handler + `scheduled()` cron |
| `bridge/` | Runs on the editing PC; talks to the editor's Drive folders only |
| `supabase/` | Migrations, seed, RLS tests |

## Content states

`Incoming → Pending Approval → Queued → Editing → Rendering → Review → (Needs Changes → Queued …) →
Approved → Scheduled → Publishing → Published`, plus `Failed` (retryable) and `Archived`.
Allowed transitions live in `src/lib/domain/status.ts`; every status change is written to
`content_audit` by a trigger, whoever made it.

## Full auto (Studio HQ workspace)

1. Upload → job `incoming` → intake rules (`full_auto`, quota) → `queued`.
2. Bridge drops the clip into the editor's inbox; editor edits; bridge imports V1 + captions → `review` (stage unset).
3. Tick routes review: `edit_approval=false` and no flag → approved automatically.
4. Posts planned per platform: caption (bridge → server AI if configured → template), slot from the
   workspace schedule rules, channel mapped to this workspace.
5. `caption_approval=false` and `final_post_approval=false` → approved → sent to Buffer
   (`customScheduled`, video via 7-day signed URL) → `scheduled` → tracked to `published`.

Interruptions only when needed: editor `NEEDS-REVIEW.txt`, no video, editor failure, missing
channel/caption problem, Buffer error, disconnected integration, or "I want to review this".
Every step stays overridable per job (`auto_post`, caption, platform, time).

## Quota accounting

Raw files, edit jobs, approved deliverables and published posts are counted separately. Limits
apply to edit jobs (counted when first queued). 20 clips grouped into 3 jobs = 3. Overage:
block / warn / require owner approval / allow + flag billable (`content_job_internal.billable_overage`).

## Security

- RLS on every table. Staff policies use `content_is_staff()`; client policies use
  `content_can(workspace, flag)` = active membership AND the specific permission flag.
- Agency-internal data is in separate tables clients cannot select: `content_job_internal`
  (agency notes, editor paths, errors), `content_integrations`, `content_audit`, `content_secrets`
  (no policies at all; service role only).
- Clients write only through security-definer RPCs that re-check membership + flag
  (`content_client_decide`, `content_client_comment`, `content_client_approve_caption`).
- Storage: one private bucket; staff-only object policies. Clients get short-lived signed URLs
  only after the owning row was read through RLS. Uploads use server-minted signed upload URLs
  for server-chosen paths under the workspace prefix.
- Cross-client publishing is impossible by construction: `content_channels.buffer_channel_id` is
  unique (one workspace per channel) and a trigger rejects any post whose channel or job belongs to
  another workspace; `sendPostToBuffer` re-checks right before calling Buffer.
- Secrets (service role, Buffer, Anthropic, CRON) are server-only env/secrets; nothing secret is
  `NEXT_PUBLIC_`. Private pages are `Cache-Control: private, no-store`; the service worker never
  stores pages or media, only hashed static assets.

## Notifications

Rows in `content_notifications` (audience staff / member / user) are the single source. In-app list
and badge today; the bridge mirrors staff alerts to the owner's ntfy topic (the channel the editor
already uses). PWA push or email = a new `DeliveryChannel` in `notify.ts` reading the same rows.

## Known limits

- Buffer: no update/delete mutation is documented, so a post already sent to Buffer is edited in
  Buffer (the app says so). Status tracking uses the documented `posts` list query.
- Supabase Storage standard uploads: the project's file-size limit applies (50 MB on Free; raise it
  on Pro for long phone videos). Resumable (TUS) uploads are a planned upgrade.
- The editor processes one job per run (unchanged); throughput is the editor's.
