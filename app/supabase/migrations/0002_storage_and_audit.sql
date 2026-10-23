-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0002: private media bucket + automatic audit trail
--
-- Storage: one private bucket, `content-media`, paths always start with the
-- workspace id:  <workspace_id>/media/…, <workspace_id>/versions/<job_id>/…,
-- <workspace_id>/brand/…
-- Only staff may touch objects directly. Clients never get a storage policy:
-- the server reads the row through RLS first (which proves the client may see
-- it) and only then mints a short-lived signed URL. Uploads use a signed upload
-- URL minted the same way, for a server-chosen path.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('content-media', 'content-media', false)
on conflict (id) do update set public = false;

create policy content_media_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'content-media' and (select public.content_is_staff()));
create policy content_media_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'content-media' and (select public.content_is_staff()));
create policy content_media_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'content-media' and (select public.content_is_staff()));
-- No delete policy: old revisions and uploads are never removed through the API.

-- ── Status changes are always audited, whoever made them (UI, RPC, bridge, cron) ──
create or replace function public.content_audit_job_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.content_audit (workspace_id, actor_id, action, entity, entity_id, detail)
    values (new.workspace_id, (select auth.uid()), 'job_created', 'job', new.id,
            jsonb_build_object('status', new.status, 'title', new.title, 'source', new.source));
  elsif new.status is distinct from old.status then
    insert into public.content_audit (workspace_id, actor_id, action, entity, entity_id, detail)
    values (new.workspace_id, (select auth.uid()), 'job_status', 'job', new.id,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger content_jobs_audit after insert or update of status on public.content_jobs
  for each row execute function public.content_audit_job_status();

create or replace function public.content_audit_post_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.content_audit (workspace_id, actor_id, action, entity, entity_id, detail)
    values (new.workspace_id, (select auth.uid()), 'post_created', 'post', new.id,
            jsonb_build_object('platform', new.platform, 'scheduled_at', new.scheduled_at));
  elsif new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at then
    insert into public.content_audit (workspace_id, actor_id, action, entity, entity_id, detail)
    values (new.workspace_id, (select auth.uid()),
            case when new.status is distinct from old.status then 'post_' || new.status else 'post_rescheduled' end,
            'post', new.id,
            jsonb_build_object('from', old.status, 'to', new.status, 'scheduled_from', old.scheduled_at,
                               'scheduled_to', new.scheduled_at, 'error', new.last_error));
  end if;
  return new;
end $$;
create trigger content_posts_audit after insert or update of status, scheduled_at on public.content_posts
  for each row execute function public.content_audit_post_status();

create or replace function public.content_audit_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.content_audit (workspace_id, actor_id, action, entity, entity_id, detail)
  values (new.workspace_id, (select auth.uid()), 'upload', 'media', new.id,
          jsonb_build_object('kind', new.kind, 'file', new.file_name, 'job_id', new.job_id));
  return new;
end $$;
create trigger content_media_audit after insert on public.content_media
  for each row execute function public.content_audit_media();

revoke execute on function public.content_audit_job_status(), public.content_audit_post_status(),
  public.content_audit_media() from public;

-- ── Dashboard read model: one round trip for the agency home screen ────────
create or replace function public.content_dashboard(p_today date, p_week_start date, p_month_start date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'uploads_awaiting', (select count(*) from public.content_media m join public.content_workspaces w on w.id = m.workspace_id
                         where m.job_id is null and m.review_status = 'incoming' and w.archived_at is null),
    'pending_approval', (select count(*) from public.content_jobs where status = 'pending_approval'),
    'agency_review', (select count(*) from public.content_jobs where status = 'review' and review_stage = 'agency'),
    'client_review', (select count(*) from public.content_jobs where status = 'review' and review_stage = 'client'),
    'needs_changes', (select count(*) from public.content_jobs where status = 'needs_changes'),
    'failed_jobs', (select count(*) from public.content_jobs where status = 'failed'),
    'attention', (select count(*) from public.content_jobs where needs_attention and status not in ('archived', 'published')),
    'failed_posts', (select count(*) from public.content_posts where status = 'failed'),
    'disconnected', (select count(*) from public.content_integrations where status in ('disconnected', 'error'))
                    + (select count(*) from public.content_channels where is_disconnected and enabled),
    'editing_now', (select count(*) from public.content_jobs where status in ('queued', 'editing', 'rendering')),
    'due_today', (select count(*) from public.content_jobs where due_date = p_today and status not in ('published', 'archived')),
    'week_posts', (select count(*) from public.content_posts where status not in ('cancelled', 'failed')
                   and scheduled_at >= p_week_start and scheduled_at < p_week_start + 7)
  );
$$;
revoke execute on function public.content_dashboard(date, date, date) from public;
grant execute on function public.content_dashboard(date, date, date) to authenticated;
