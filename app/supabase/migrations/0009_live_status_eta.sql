-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0009: live status + "ready in about…" estimates
--   A. content_jobs.eta_at — when the editing PC expects the edit to be ready
--      (written by the bridge from the editor's queue and its recent edit times).
--   B. Realtime: job, post and notification changes are pushed to open apps, so
--      statuses update without refreshing. Realtime respects RLS: people only
--      receive changes to rows they can already read.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.content_jobs add column if not exists eta_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['content_jobs', 'content_posts', 'content_notifications'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
