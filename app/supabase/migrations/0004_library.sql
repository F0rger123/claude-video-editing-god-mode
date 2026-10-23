-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0004: materials library
--
-- Sound effects, overlays (film burns, light leaks), LUTs, fonts, music and
-- other materials the editor may use. Each item is ONE of:
--   storage_path  a file uploaded in the app (phone or computer)
--   url           a link (a direct file link is downloaded; a page is passed to Claude)
--   local_path    a file or folder already on the editing PC ("Hey Claude, use this")
-- workspace_id null = available for every client; otherwise that client only.
-- The editing-PC bridge copies items into the editor's folder (sound effects into
-- "Sound effects/", the rest into "Library/<kind>/") and writes an index Claude reads.
-- Staff only: clients never see the library.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.content_library (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.content_workspaces (id) on delete cascade,
  kind text not null check (kind in ('sfx', 'music', 'overlay', 'lut', 'font', 'caption', 'reference', 'other')),
  name text not null check (length(name) between 1 and 120),
  notes text,
  storage_path text,
  url text,
  local_path text,
  file_name text,
  synced_path text,                 -- where the bridge put it on the editing PC
  sync_error text,
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null or local_path is not null)
);
create index content_library_kind_idx on public.content_library (kind, workspace_id) where archived_at is null;

alter table public.content_library enable row level security;
create policy library_staff on public.content_library for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));

-- Library uploads live under library/ in the private bucket (staff-only object policies already apply).
