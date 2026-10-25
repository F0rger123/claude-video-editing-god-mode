-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0012: post straight to YouTube (no Buffer)
-- A channel now has a provider. Direct YouTube channels are connected with
-- Google sign-in; their refresh token lives in content_channel_tokens, which
-- (like content_secrets) has RLS on, no policies and no grants: service role only.
-- Ids stay in the existing columns, prefixed so they can never clash with Buffer's:
--   content_channels.buffer_channel_id = 'youtube:<channel id>'
--   content_posts.buffer_post_id       = 'youtube:<video id>'
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.content_channels add column if not exists provider text not null default 'buffer'
  check (provider in ('buffer', 'youtube'));
comment on column public.content_channels.buffer_channel_id is
  'Remote channel id: the Buffer channel id, or youtube:<channel id> for a direct YouTube channel. Unique: one workspace per channel.';

create table if not exists public.content_channel_tokens (
  channel_id uuid primary key references public.content_channels (id) on delete cascade,
  refresh_token text not null,
  scope text,
  updated_at timestamptz not null default now()
);
comment on table public.content_channel_tokens is 'Service role only. RLS on, no policies, no grants.';
alter table public.content_channel_tokens enable row level security;
revoke all on public.content_channel_tokens from anon, authenticated;

alter table public.content_integrations drop constraint if exists content_integrations_kind_check;
alter table public.content_integrations add constraint content_integrations_kind_check
  check (kind in ('editor', 'buffer', 'drive', 'captions', 'youtube'));
