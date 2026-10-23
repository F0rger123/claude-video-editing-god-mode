-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0003: script ideas, style presets, post timing
--
--   A. content_style_presets — named per-client styles (captions, sound effects,
--      editing look) with reference files/links. An upload picks one per kind or
--      leaves it to Claude.
--   B. content_script_ideas — hook + script ideas Claude writes per client. Swipe
--      right (like) / left (pass, optional reason); liked ideas can be saved,
--      recorded, and linked to the video job made from them. Decisions feed the
--      next generation, so Claude learns each brand's taste.
--   C. Job / workspace post timing: auto slot | right after editing | fixed time.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Style presets ───────────────────────────────────────────────────────
create table public.content_style_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  kind text not null check (kind in ('captions', 'sound', 'edit')),
  name text not null check (length(name) between 1 and 80),
  instructions text,                 -- what the editor should do, in plain words
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index content_style_presets_ws_idx on public.content_style_presets (workspace_id, kind) where archived_at is null;
create unique index content_style_presets_one_default on public.content_style_presets (workspace_id, kind) where is_default and archived_at is null;

-- Reference files / links that belong to a preset (screenshots, MP4 recordings, IG links).
alter table public.content_media add column preset_id uuid references public.content_style_presets (id) on delete set null;
create index content_media_preset_idx on public.content_media (preset_id) where preset_id is not null;

alter table public.content_style_presets enable row level security;
create policy presets_staff on public.content_style_presets for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
-- Clients may see their workspace's style names to pick one when uploading.
create policy presets_client_read on public.content_style_presets for select to authenticated
  using (archived_at is null and public.content_can(workspace_id, 'can_upload'));

-- ── B. Script ideas ────────────────────────────────────────────────────────
create table public.content_script_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  form text not null default 'short' check (form in ('short', 'long')),
  hook text not null check (length(hook) between 1 and 400),
  script text,
  angle text,                        -- e.g. "myth-busting", "before/after", "listicle"
  why text,                          -- why Claude thinks it works (viral pattern)
  source text not null default 'claude' check (source in ('claude', 'manual')),
  status text not null default 'new' check (status in ('new', 'liked', 'passed', 'saved', 'recorded', 'archived')),
  reason text,                       -- optional "why not" on a pass; teaches the next batch
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  job_id uuid references public.content_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index content_script_ideas_ws_status_idx on public.content_script_ideas (workspace_id, status, created_at desc);

alter table public.content_jobs add column script_id uuid references public.content_script_ideas (id) on delete set null;

alter table public.content_script_ideas enable row level security;
create policy scripts_staff on public.content_script_ideas for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy scripts_client_read on public.content_script_ideas for select to authenticated
  using (status <> 'archived' and public.content_can(workspace_id, 'can_view_scripts'));

-- Client swipe / save. Needs can_swipe_scripts. Clients may also add their own idea.
create or replace function public.content_client_script(p_idea uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.content_script_ideas;
begin
  select * into s from public.content_script_ideas where id = p_idea;
  if s.id is null or s.status = 'archived' then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public.content_is_member(s.workspace_id) or not public.content_can(s.workspace_id, 'can_swipe_scripts') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('liked', 'passed', 'saved') then raise exception 'Unknown choice' using errcode = '22023'; end if;
  update public.content_script_ideas
     set status = p_status, reason = left(nullif(trim(p_reason), ''), 500), decided_by = (select auth.uid()), decided_at = now()
   where id = s.id;
  insert into public.content_audit (workspace_id, actor_id, actor_label, action, entity, entity_id)
  values (s.workspace_id, (select auth.uid()), 'client', 'script_' || p_status, 'script', s.id);
end $$;

create or replace function public.content_client_add_script(p_workspace uuid, p_hook text, p_script text default null, p_form text default 'short')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.content_is_member(p_workspace) or not public.content_can(p_workspace, 'can_swipe_scripts') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(trim(p_hook), '') = '' then raise exception 'Write the hook first.' using errcode = '22023'; end if;
  insert into public.content_script_ideas (workspace_id, form, hook, script, source, status, decided_by, decided_at)
  values (p_workspace, case when p_form = 'long' then 'long' else 'short' end, left(trim(p_hook), 400), left(p_script, 8000), 'manual', 'saved', (select auth.uid()), now())
  returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.content_client_script(uuid, text, text), public.content_client_add_script(uuid, text, text, text) from public;
grant execute on function public.content_client_script(uuid, text, text), public.content_client_add_script(uuid, text, text, text) to authenticated;

-- ── C. Post timing + per-upload style choices ─────────────────────────────
alter table public.content_jobs
  add column post_timing text check (post_timing in ('auto_slot', 'after_edit', 'fixed')),   -- null = workspace default
  add column post_at timestamptz,                                                             -- for 'fixed'
  add column style_choices jsonb not null default '{}'::jsonb;                                -- {captions, sound, edit: preset id | 'auto'}, notes

alter table public.content_workspaces
  add column default_post_timing text not null default 'auto_slot' check (default_post_timing in ('auto_slot', 'after_edit', 'fixed')),
  add column default_post_time text check (default_post_time ~ '^\d{2}:\d{2}$'),               -- "12:00" for 'fixed'
  add column scripts_enabled boolean not null default false,
  add column scripts_per_batch int not null default 6 check (scripts_per_batch between 1 and 20);
