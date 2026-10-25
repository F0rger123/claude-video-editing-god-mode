-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0010: phone notifications (Web Push)
-- One row per phone / browser that turned notifications on. The endpoint and keys
-- are what the browser's push service gave that device; they can only be used to
-- send to it. People manage their own rows; the server (service role) reads them
-- to send and removes ones the push service says are gone.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.content_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists content_push_subscriptions_user_idx on public.content_push_subscriptions (user_id);

alter table public.content_push_subscriptions enable row level security;

drop policy if exists push_own_select on public.content_push_subscriptions;
create policy push_own_select on public.content_push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_own_insert on public.content_push_subscriptions;
create policy push_own_insert on public.content_push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_own_delete on public.content_push_subscriptions;
create policy push_own_delete on public.content_push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.content_push_subscriptions from anon, authenticated;
revoke all on public.content_push_subscriptions from anon;
