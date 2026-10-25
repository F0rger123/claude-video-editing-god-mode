-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0013: post Reels straight to Instagram (no Buffer)
-- Connected with Instagram's own business login. The 60-day Instagram token is kept in
-- content_channel_tokens (service role only) and refreshed by the app before it runs out.
-- Instagram has no scheduling, so the app publishes at the posting time itself:
--   content_channels.buffer_channel_id = 'instagram:<instagram user id>'
--   content_posts.buffer_post_id       = 'igc:<container id>'  (uploaded, waiting for its time)
--                                       'instagram:<media id>' (live)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.content_channels drop constraint if exists content_channels_provider_check;
alter table public.content_channels add constraint content_channels_provider_check
  check (provider in ('buffer', 'youtube', 'instagram'));

alter table public.content_channel_tokens add column if not exists expires_at timestamptz;

alter table public.content_integrations drop constraint if exists content_integrations_kind_check;
alter table public.content_integrations add constraint content_integrations_kind_check
  check (kind in ('editor', 'buffer', 'drive', 'captions', 'youtube', 'instagram'));
