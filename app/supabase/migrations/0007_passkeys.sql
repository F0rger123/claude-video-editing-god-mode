-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0007: fingerprint / face sign-in (passkeys)
-- One row per passkey a person saved on a phone or computer. Only the public key is
-- stored. The server (service role) verifies sign-ins and writes rows; people may
-- list and remove their own passkeys, nothing else.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.content_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists content_passkeys_user_idx on public.content_passkeys (user_id);

alter table public.content_passkeys enable row level security;

drop policy if exists content_passkeys_own_select on public.content_passkeys;
create policy content_passkeys_own_select on public.content_passkeys
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists content_passkeys_own_delete on public.content_passkeys;
create policy content_passkeys_own_delete on public.content_passkeys
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert, update on public.content_passkeys from anon, authenticated;
revoke all on public.content_passkeys from anon;
