-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0001: core schema, roles and workspace isolation
--
-- Every table is prefixed `content_` so it can later move into the Studio HQ
-- database without colliding with its CRM tables (clients, social_posts …).
--
-- Roles
--   owner / agency  rows in content_staff. See every workspace.
--   client          rows in content_members, scoped to ONE workspace, with
--                   independently toggleable permissions (jsonb flags).
--
-- Isolation rules (enforced here, not in the UI)
--   * Clients only ever match rows whose workspace_id is a workspace they are an
--     active (non-revoked) member of, AND the matching permission flag is true.
--   * Agency-internal data lives in separate tables with staff-only policies:
--     content_job_internal (agency notes, editor/bridge references, error detail),
--     content_secrets (no policies at all: service role only),
--     content_integrations, content_audit.
--   * Workspace settings (package, rules, Drive mapping) are staff-only; clients
--     read their portal header through content_portal_workspace().
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Staff ──────────────────────────────────────────────────────────────────
create table public.content_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'agency')),
  display_name text,
  created_at timestamptz not null default now()
);
comment on table public.content_staff is
  'Studio HQ people. Granted with SQL only (see supabase/README.md); not writable through the API.';

-- ── Workspaces ─────────────────────────────────────────────────────────────
create table public.content_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  is_agency boolean not null default false,
  logo_path text,
  contact_email text,
  -- Brand / style profile handed to the editor (About this brand.txt) and to caption generation.
  brand_profile jsonb not null default '{}'::jsonb,
  -- Folder name under the editor's Drive root (HERK_DRIVE_ROOT). Defaults to the workspace name.
  editor_brand_folder text,
  allowed_platforms text[] not null default array['instagram', 'facebook', 'tiktok', 'youtube'],
  access_mode text not null default 'agency_only'
    check (access_mode in ('agency_only', 'client_upload', 'client_collab')),
  automation_mode text not null default 'manual'
    check (automation_mode in ('manual', 'auto', 'conditional', 'full_auto')),
  conditional_rules jsonb not null default '{}'::jsonb,
  -- Defaults for new client members of this workspace.
  default_permissions jsonb not null default '{}'::jsonb,
  package jsonb not null default '{}'::jsonb,
  overage_behavior text not null default 'require_owner_approval'
    check (overage_behavior in ('block', 'warn', 'require_owner_approval', 'allow_billable')),
  approval_rules jsonb not null default '{"edit_approval": true, "caption_approval": true, "final_post_approval": false}'::jsonb,
  schedule_rules jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/New_York',
  posting_frequency text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index content_workspaces_one_agency on public.content_workspaces (is_agency) where is_agency;

-- ── Client members ─────────────────────────────────────────────────────────
create table public.content_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text not null,
  role text not null default 'client' check (role in ('client')),
  permissions jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  invited_at timestamptz not null default now(),
  unique (workspace_id, invited_email)
);
create index content_members_user_idx on public.content_members (user_id) where revoked_at is null;

-- ── Authorisation helpers (security definer, fixed search_path) ────────────
create or replace function public.content_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.content_staff s where s.user_id = (select auth.uid()));
$$;

create or replace function public.content_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.content_staff s where s.user_id = (select auth.uid()) and s.role = 'owner');
$$;

create or replace function public.content_is_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.content_members m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.revoked_at is null
  );
$$;

-- Staff always pass. A client passes when active member of the workspace AND the flag is true.
create or replace function public.content_can(p_workspace uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.content_is_staff() or exists (
    select 1 from public.content_members m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.revoked_at is null
      and coalesce((m.permissions ->> p_perm)::boolean, false)
  );
$$;

revoke execute on function public.content_is_staff(), public.content_is_owner(),
  public.content_is_member(uuid), public.content_can(uuid, text) from public;
grant execute on function public.content_is_staff(), public.content_is_owner(),
  public.content_is_member(uuid), public.content_can(uuid, text) to authenticated;

-- ── Content jobs (one intended video = one job, however many source files) ─
create table public.content_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete restrict,
  title text not null check (length(title) between 1 and 160),
  form text not null default 'short' check (form in ('short', 'long')),
  platforms text[] not null default '{}',
  status text not null default 'incoming' check (status in (
    'incoming', 'pending_approval', 'queued', 'editing', 'rendering', 'review', 'needs_changes',
    'approved', 'scheduled', 'publishing', 'published', 'failed', 'archived')),
  -- Who must look next while in review: the agency first, then (if configured) the client.
  review_stage text check (review_stage in ('agency', 'client')),
  needs_attention boolean not null default false,
  attention_reason text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_date date,
  category text,
  client_notes text,
  requested_outputs int not null default 1 check (requested_outputs between 1 and 6),
  auto_post boolean,               -- null = follow the workspace rules
  revision_count int not null default 0,
  current_version_id uuid,
  source text not null default 'agency' check (source in ('agency', 'client', 'drive')),
  created_by uuid references auth.users (id) on delete set null,
  queued_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_jobs_ws_status_idx on public.content_jobs (workspace_id, status);
create index content_jobs_status_idx on public.content_jobs (status) where status not in ('published', 'archived');
create index content_jobs_attention_idx on public.content_jobs (workspace_id) where needs_attention;

-- Agency-only side of a job. Never visible to clients.
create table public.content_job_internal (
  job_id uuid primary key references public.content_jobs (id) on delete cascade,
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  agency_notes text,
  billable_overage boolean not null default false,
  overage_approved_by uuid references auth.users (id) on delete set null,
  quota_snapshot jsonb,
  editor_ref jsonb not null default '{}'::jsonb,  -- bridge: clip base, Drive paths, editor project, state keys
  last_error text,
  updated_at timestamptz not null default now()
);
create index content_job_internal_ws_idx on public.content_job_internal (workspace_id);

-- ── Media (raw files, photos, B-roll, references, links, notes) ────────────
create table public.content_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete restrict,
  job_id uuid references public.content_jobs (id) on delete set null,
  kind text not null check (kind in (
    'video', 'photo', 'audio', 'broll', 'logo', 'reference_video', 'reference_image', 'link', 'note')),
  -- Role inside its job: primary take, alternate take, supporting media, or reference only.
  role text not null default 'source' check (role in ('primary', 'source', 'reference')),
  review_status text not null default 'incoming' check (review_status in (
    'incoming', 'accepted', 'reference_only', 'rejected', 'rerecord_requested')),
  storage_path text,               -- content-media/<workspace_id>/<…>
  url text,                        -- Instagram / TikTok / YouTube links
  body text,                       -- written notes
  file_name text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  upload_group uuid,               -- files submitted together (client "one intended video")
  uploaded_by uuid references auth.users (id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null or body is not null)
);
create index content_media_ws_idx on public.content_media (workspace_id, created_at desc);
create index content_media_job_idx on public.content_media (job_id);
create index content_media_incoming_idx on public.content_media (workspace_id) where job_id is null and review_status = 'incoming';

-- ── Versions (V1, V2 …; never deleted automatically) ───────────────────────
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_jobs (id) on delete cascade,
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  number int not null check (number > 0),
  storage_path text not null,
  thumbnail_path text,
  description text,
  duration_seconds numeric,
  client_visible boolean not null default false,
  decision text not null default 'pending' check (decision in (
    'pending', 'approved', 'changes_requested', 'rejected', 'rerecord')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, number)
);
create index content_versions_ws_idx on public.content_versions (workspace_id);
alter table public.content_jobs
  add constraint content_jobs_current_version_fk foreign key (current_version_id)
  references public.content_versions (id) on delete set null;

-- ── Feedback (general or timestamped; internal notes stay internal) ────────
create table public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_jobs (id) on delete cascade,
  version_id uuid references public.content_versions (id) on delete cascade,
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_label text,
  body text not null check (length(body) between 1 and 4000),
  at_seconds numeric check (at_seconds >= 0),
  reference_url text,
  media_id uuid references public.content_media (id) on delete set null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index content_feedback_job_idx on public.content_feedback (job_id, created_at);

-- Structured instructions handed to the editor (one per "Needs changes").
create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_jobs (id) on delete cascade,
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  from_version_id uuid references public.content_versions (id) on delete set null,
  round int not null,
  instructions jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'failed')),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index content_revisions_pending_idx on public.content_revisions (status) where status = 'pending';

-- ── Buffer channels mapped to exactly one workspace ────────────────────────
create table public.content_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  buffer_channel_id text not null unique,   -- a channel can never belong to two workspaces
  buffer_org_id text,
  platform text not null,
  name text not null,
  avatar_url text,
  is_disconnected boolean not null default false,
  enabled boolean not null default true,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index content_channels_ws_idx on public.content_channels (workspace_id);

-- ── Posts (one per platform/channel) ───────────────────────────────────────
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.content_jobs (id) on delete cascade,
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  version_id uuid references public.content_versions (id) on delete set null,
  channel_id uuid references public.content_channels (id) on delete set null,
  platform text not null,
  caption text,
  title text,
  description text,
  hashtags text[] not null default '{}',
  cta text,
  caption_source text not null default 'manual' check (caption_source in ('manual', 'bridge', 'server', 'template')),
  caption_approved boolean not null default false,
  scheduled_at timestamptz,
  slot_source text check (slot_source in ('auto', 'manual')),
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  buffer_post_id text unique,
  buffer_status text,
  last_error text,
  attempts int not null default 0,
  published_at timestamptz,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_posts_ws_time_idx on public.content_posts (workspace_id, scheduled_at);
create index content_posts_status_idx on public.content_posts (status) where status in ('approved', 'scheduled', 'publishing', 'failed');
create index content_posts_job_idx on public.content_posts (job_id);

-- Guard against cross-workspace publishing: a post's channel must belong to the post's workspace.
create or replace function public.content_posts_channel_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.channel_id is not null and not exists (
    select 1 from public.content_channels c where c.id = new.channel_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'Channel does not belong to this workspace' using errcode = '42501';
  end if;
  if not exists (select 1 from public.content_jobs j where j.id = new.job_id and j.workspace_id = new.workspace_id) then
    raise exception 'Job does not belong to this workspace' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger content_posts_channel_guard before insert or update of channel_id, workspace_id, job_id
  on public.content_posts for each row execute function public.content_posts_channel_guard();

-- Same guard for every child row that carries a denormalised workspace_id.
create or replace function public.content_child_workspace_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.job_id is not null and not exists (
    select 1 from public.content_jobs j where j.id = new.job_id and j.workspace_id = new.workspace_id
  ) then
    raise exception 'Job does not belong to this workspace' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger content_media_ws_guard before insert or update of job_id, workspace_id
  on public.content_media for each row execute function public.content_child_workspace_guard();
create trigger content_versions_ws_guard before insert or update of job_id, workspace_id
  on public.content_versions for each row execute function public.content_child_workspace_guard();
create trigger content_feedback_ws_guard before insert or update of job_id, workspace_id
  on public.content_feedback for each row execute function public.content_child_workspace_guard();
create trigger content_revisions_ws_guard before insert or update of job_id, workspace_id
  on public.content_revisions for each row execute function public.content_child_workspace_guard();
create trigger content_job_internal_ws_guard before insert or update of job_id, workspace_id
  on public.content_job_internal for each row execute function public.content_child_workspace_guard();

-- ── Notifications (in-app now; push/email channels read the same rows) ─────
create table public.content_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.content_workspaces (id) on delete cascade,
  -- 'staff' = every agency user; 'member' = the client members of workspace_id; 'user' = user_id only.
  audience text not null check (audience in ('staff', 'member', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'client_upload', 'edit_complete', 'approval_needed', 'client_feedback', 'publish_failed',
    'integration_disconnected', 'quota_reached', 'edit_failed', 'needs_attention', 'published')),
  title text not null,
  body text,
  link text,
  job_id uuid references public.content_jobs (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index content_notifications_ws_idx on public.content_notifications (workspace_id, created_at desc);
create index content_notifications_staff_idx on public.content_notifications (created_at desc) where audience = 'staff';

create table public.content_notification_reads (
  notification_id uuid not null references public.content_notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ── Audit log ──────────────────────────────────────────────────────────────
create table public.content_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.content_workspaces (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_label text,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index content_audit_ws_idx on public.content_audit (workspace_id, at desc);
create index content_audit_entity_idx on public.content_audit (entity_id);

-- ── Integrations health + secrets ──────────────────────────────────────────
create table public.content_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.content_workspaces (id) on delete cascade,  -- null = agency-wide
  kind text not null check (kind in ('editor', 'buffer', 'drive', 'captions')),
  status text not null default 'unknown' check (status in ('ok', 'degraded', 'disconnected', 'error', 'unknown')),
  last_seen_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index content_integrations_kind_idx on public.content_integrations (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

create table public.content_secrets (
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  kind text not null check (kind in ('buffer_api_key')),
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kind)
);
comment on table public.content_secrets is 'Service role only. RLS on, no policies, no grants.';

-- ── updated_at maintenance ─────────────────────────────────────────────────
create or replace function public.content_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger content_workspaces_touch before update on public.content_workspaces for each row execute function public.content_touch();
create trigger content_jobs_touch before update on public.content_jobs for each row execute function public.content_touch();
create trigger content_posts_touch before update on public.content_posts for each row execute function public.content_touch();
create trigger content_job_internal_touch before update on public.content_job_internal for each row execute function public.content_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- Row level security
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.content_staff enable row level security;
alter table public.content_workspaces enable row level security;
alter table public.content_members enable row level security;
alter table public.content_jobs enable row level security;
alter table public.content_job_internal enable row level security;
alter table public.content_media enable row level security;
alter table public.content_versions enable row level security;
alter table public.content_feedback enable row level security;
alter table public.content_revisions enable row level security;
alter table public.content_channels enable row level security;
alter table public.content_posts enable row level security;
alter table public.content_notifications enable row level security;
alter table public.content_notification_reads enable row level security;
alter table public.content_audit enable row level security;
alter table public.content_integrations enable row level security;
alter table public.content_secrets enable row level security;

revoke all on public.content_secrets from anon, authenticated;
revoke all on all tables in schema public from anon;

-- Staff: own row readable; nobody writes through the API.
create policy staff_self on public.content_staff for select to authenticated
  using (user_id = (select auth.uid()) or (select public.content_is_staff()));

-- Workspaces: staff only (clients use content_portal_workspace()).
create policy ws_staff on public.content_workspaces for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

-- Members: staff manage; a client sees only their own membership row.
create policy members_staff on public.content_members for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy members_self on public.content_members for select to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null);

-- Jobs: staff all; clients read jobs of their workspace if they may see any of its content.
create policy jobs_staff on public.content_jobs for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy jobs_client_read on public.content_jobs for select to authenticated
  using (
    status <> 'archived' and (
      public.content_can(workspace_id, 'can_view_drafts')
      or public.content_can(workspace_id, 'can_view_calendar')
      or (status = 'published' and public.content_can(workspace_id, 'can_view_published'))
      or (source = 'client' and public.content_can(workspace_id, 'can_upload'))
    )
  );

create policy job_internal_staff on public.content_job_internal for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

-- Media: staff all; clients see what they uploaded (can_upload) and nothing else raw.
create policy media_staff on public.content_media for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy media_client_read on public.content_media for select to authenticated
  using (uploaded_by = (select auth.uid()) and public.content_can(workspace_id, 'can_upload'));

-- Versions: clients see only versions released to them, with can_view_drafts.
create policy versions_staff on public.content_versions for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy versions_client_read on public.content_versions for select to authenticated
  using (client_visible and public.content_can(workspace_id, 'can_view_drafts'));

-- Feedback: internal notes never reach clients.
create policy feedback_staff on public.content_feedback for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy feedback_client_read on public.content_feedback for select to authenticated
  using (not internal and public.content_can(workspace_id, 'can_view_drafts'));

create policy revisions_staff on public.content_revisions for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

create policy channels_staff on public.content_channels for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

-- Posts: calendar permission shows the plan; published permission shows published posts.
create policy posts_staff on public.content_posts for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy posts_client_read on public.content_posts for select to authenticated
  using (
    status <> 'cancelled' and (
      public.content_can(workspace_id, 'can_view_calendar')
      or (status = 'published' and public.content_can(workspace_id, 'can_view_published'))
    )
  );

create policy notifications_read on public.content_notifications for select to authenticated
  using (
    (audience = 'staff' and (select public.content_is_staff()))
    or (audience = 'member' and public.content_is_member(workspace_id))
    or (audience = 'user' and user_id = (select auth.uid()))
  );
create policy notification_reads_own on public.content_notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy audit_staff_read on public.content_audit for select to authenticated
  using ((select public.content_is_staff()));

create policy integrations_staff on public.content_integrations for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

-- ═══════════════════════════════════════════════════════════════════════════
-- Client-facing RPCs (security definer, permission-checked, narrow)
-- ═══════════════════════════════════════════════════════════════════════════

-- Portal header: only presentation fields, never package/rules/Drive mapping.
create or replace function public.content_portal_workspace(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', w.id, 'name', w.name, 'slug', w.slug, 'logo_path', w.logo_path,
    'allowed_platforms', w.allowed_platforms, 'timezone', w.timezone,
    'permissions', coalesce(m.permissions, '{}'::jsonb)
  )
  from public.content_workspaces w
  join public.content_members m on m.workspace_id = w.id
  where w.slug = p_slug and w.archived_at is null
    and m.user_id = (select auth.uid()) and m.revoked_at is null;
$$;

-- Which portals can the signed-in client open?
create or replace function public.content_my_portals()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', w.slug, 'name', w.name) order by w.name), '[]'::jsonb)
  from public.content_workspaces w
  join public.content_members m on m.workspace_id = w.id
  where m.user_id = (select auth.uid()) and m.revoked_at is null and w.archived_at is null;
$$;

-- Client decision on a released version. Each decision needs its own flag.
create or replace function public.content_client_decide(p_version uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.content_versions;
  j public.content_jobs;
  needed text;
begin
  select * into v from public.content_versions where id = p_version;
  if v.id is null or not v.client_visible then raise exception 'Not found' using errcode = 'P0002'; end if;
  select * into j from public.content_jobs where id = v.job_id;
  if j.status <> 'review' or j.review_stage is distinct from 'client' then
    raise exception 'This version is not waiting for your review.' using errcode = '22023';
  end if;
  needed := case p_decision when 'approved' then 'can_approve'
                            when 'changes_requested' then 'can_request_changes'
                            else null end;
  if needed is null then raise exception 'Unknown decision' using errcode = '22023'; end if;
  if not public.content_is_member(v.workspace_id) or not public.content_can(v.workspace_id, needed) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_decision = 'changes_requested' and coalesce(trim(p_note), '') = '' then
    raise exception 'Tell us what to change.' using errcode = '22023';
  end if;

  if p_note is not null and trim(p_note) <> '' then
    insert into public.content_feedback (job_id, version_id, workspace_id, author_id, author_label, body)
    values (v.job_id, v.id, v.workspace_id, (select auth.uid()), 'Client', left(trim(p_note), 4000));
  end if;

  update public.content_versions set decision = p_decision, decided_by = (select auth.uid()), decided_at = now()
  where id = v.id;

  if p_decision = 'approved' then
    update public.content_jobs set status = 'approved', review_stage = null, approved_at = coalesce(approved_at, now())
    where id = j.id;
  else
    update public.content_jobs set status = 'needs_changes', review_stage = null where id = j.id;
  end if;

  insert into public.content_audit (workspace_id, actor_id, actor_label, action, entity, entity_id, detail)
  values (v.workspace_id, (select auth.uid()), 'client', 'client_' || p_decision, 'version', v.id,
          jsonb_build_object('job_id', j.id, 'version', v.number));
  insert into public.content_notifications (workspace_id, audience, kind, title, body, link, job_id)
  values (v.workspace_id, 'staff', 'client_feedback',
          case when p_decision = 'approved' then 'Client approved ' else 'Client requested changes: ' end || j.title,
          left(p_note, 280), '/jobs/' || j.id, j.id);
  return jsonb_build_object('ok', true);
end $$;

-- Client comment (general or timestamped) on a released version.
create or replace function public.content_client_comment(p_version uuid, p_body text, p_at numeric default null, p_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.content_versions; new_id uuid;
begin
  select * into v from public.content_versions where id = p_version;
  if v.id is null or not v.client_visible then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public.content_is_member(v.workspace_id) or not public.content_can(v.workspace_id, 'can_comment') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Comment is empty' using errcode = '22023'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'Links must start with http(s)://' using errcode = '22023'; end if;
  insert into public.content_feedback (job_id, version_id, workspace_id, author_id, author_label, body, at_seconds, reference_url)
  values (v.job_id, v.id, v.workspace_id, (select auth.uid()), 'Client', left(trim(p_body), 4000), p_at, p_url)
  returning id into new_id;
  insert into public.content_notifications (workspace_id, audience, kind, title, body, link, job_id)
  select v.workspace_id, 'staff', 'client_feedback', 'Client comment on ' || j.title, left(p_body, 280), '/jobs/' || j.id, j.id
  from public.content_jobs j where j.id = v.job_id;
  return new_id;
end $$;

-- Client caption approval (only when the workspace asks clients to approve captions).
create or replace function public.content_client_approve_caption(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.content_posts;
begin
  select * into p from public.content_posts where id = p_post;
  if p.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public.content_is_member(p.workspace_id) or not public.content_can(p.workspace_id, 'can_approve') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.content_posts set caption_approved = true where id = p.id and status = 'awaiting_approval';
  insert into public.content_audit (workspace_id, actor_id, actor_label, action, entity, entity_id)
  values (p.workspace_id, (select auth.uid()), 'client', 'caption_approved', 'post', p.id);
end $$;

revoke execute on function public.content_portal_workspace(text), public.content_my_portals(),
  public.content_client_decide(uuid, text, text), public.content_client_comment(uuid, text, numeric, text),
  public.content_client_approve_caption(uuid) from public;
grant execute on function public.content_portal_workspace(text), public.content_my_portals(),
  public.content_client_decide(uuid, text, text), public.content_client_comment(uuid, text, numeric, text),
  public.content_client_approve_caption(uuid) to authenticated;

-- Trigger helpers are internal only.
revoke execute on function public.content_posts_channel_guard(), public.content_child_workspace_guard(),
  public.content_touch() from public;
