-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0011: ready-made ideas (instant "Short-form" / "Long-form")
-- The editing PC keeps a few ideas pre-written per workspace and form, in status
-- 'pool' (invisible to everyone). A plain request ("Claude picks", no topic) is
-- filled from the pool at once; the PC then refills it in the background.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.content_script_ideas drop constraint if exists content_script_ideas_status_check;
alter table public.content_script_ideas add constraint content_script_ideas_status_check
  check (status in ('pool', 'new', 'liked', 'passed', 'saved', 'recorded', 'archived'));

create index if not exists content_script_ideas_pool_idx on public.content_script_ideas (workspace_id, form, created_at) where status = 'pool';

-- Clients never see pool ideas until they are handed out.
drop policy if exists scripts_client_read on public.content_script_ideas;
create policy scripts_client_read on public.content_script_ideas for select to authenticated
  using (status not in ('archived', 'pool') and public.content_can(workspace_id, 'can_view_scripts'));
