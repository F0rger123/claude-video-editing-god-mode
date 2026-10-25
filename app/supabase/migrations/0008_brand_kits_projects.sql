-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0008: brand kits + projects
--   A. content_projects — campaigns / series inside a client (or the business's own
--      brand): a name, a brief, and their own references. Videos can belong to one.
--   B. content_brand_assets — each client's brand kit: logos, watermark, colors,
--      fonts, intro/outro, music, photos, reference videos. Optionally tied to a
--      project. Files live in the private bucket under brand/<workspace>/.
--   C. content_jobs.project_id / use_brand_kit — which project a video is for and
--      whether the editor should apply the brand kit.
-- Staff manage everything. Client members may read their own workspace's kit and
-- projects (so their portal can show their logo); they never write them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Projects ────────────────────────────────────────────────────────────
create table public.content_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  brief text check (length(brief) <= 4000),
  status text not null default 'active' check (status in ('active', 'done')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_projects_ws_idx on public.content_projects (workspace_id, status);

alter table public.content_projects enable row level security;
create policy projects_staff on public.content_projects for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy projects_client_read on public.content_projects for select to authenticated
  using (public.content_is_member(workspace_id));

-- ── B. Brand kit ───────────────────────────────────────────────────────────
create table public.content_brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  project_id uuid references public.content_projects (id) on delete cascade,
  kind text not null check (kind in ('logo', 'watermark', 'color', 'font', 'intro', 'outro', 'music', 'photo', 'reference', 'other')),
  name text not null check (length(name) between 1 and 120),
  notes text check (length(notes) <= 1000),
  value text check (value is null or value ~ '^#[0-9a-fA-F]{6}$'),   -- colors only
  storage_path text,
  url text,
  file_name text,
  mime_type text,
  is_primary boolean not null default false,                          -- the main logo / main color
  sort int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (value is not null or storage_path is not null or url is not null)
);
create index content_brand_assets_ws_idx on public.content_brand_assets (workspace_id, kind) where archived_at is null;
create unique index content_brand_assets_one_primary on public.content_brand_assets (workspace_id, kind)
  where is_primary and archived_at is null and project_id is null;

alter table public.content_brand_assets enable row level security;
create policy brand_assets_staff on public.content_brand_assets for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy brand_assets_client_read on public.content_brand_assets for select to authenticated
  using (archived_at is null and public.content_is_member(workspace_id));

-- ── C. Jobs ────────────────────────────────────────────────────────────────
alter table public.content_jobs add column project_id uuid references public.content_projects (id) on delete set null;
alter table public.content_jobs add column use_brand_kit boolean not null default true;
create index content_jobs_project_idx on public.content_jobs (project_id) where project_id is not null;

create trigger content_projects_touch before update on public.content_projects
  for each row execute function public.content_touch();
