-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0005: full content ideas on request, with client limits
--
-- "Long-form ideas" / "Short-form ideas" buttons create a request (form, style,
-- optional topic). Claude writes complete ideas for it: title, hook, script or
-- outline, B-roll and shot list, thumbnail text, caption. They land in the same
-- swipe deck as script ideas.
-- Clients may request ideas only with can_generate_ideas, and only up to the
-- workspace's monthly limit (protects the owner's Claude usage). Staff: no limit.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.content_workspaces
  add column idea_requests_per_month int not null default 4 check (idea_requests_per_month between 0 and 500),
  add column ideas_per_request int not null default 5 check (ideas_per_request between 1 and 10);

create table public.content_idea_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.content_workspaces (id) on delete cascade,
  form text not null check (form in ('short', 'long')),
  style text not null check (length(style) between 1 and 60),
  topic text check (length(topic) <= 500),
  count int not null default 5 check (count between 1 and 10),
  status text not null default 'pending' check (status in ('pending', 'writing', 'done', 'failed')),
  error text,
  by_client boolean not null default false,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index content_idea_requests_pending_idx on public.content_idea_requests (created_at) where status in ('pending', 'writing');
create index content_idea_requests_ws_idx on public.content_idea_requests (workspace_id, created_at desc);

alter table public.content_script_ideas
  add column title text,
  add column style text,
  add column outline text,
  add column thumbnail_text text,
  add column broll text,
  add column caption text,
  add column request_id uuid references public.content_idea_requests (id) on delete set null;

alter table public.content_idea_requests enable row level security;
create policy idea_requests_staff on public.content_idea_requests for all to authenticated
  using ((select public.content_is_staff())) with check ((select public.content_is_staff()));
create policy idea_requests_client_read on public.content_idea_requests for select to authenticated
  using (by_client and public.content_can(workspace_id, 'can_generate_ideas'));

-- Client usage this month (requests made by clients of this workspace).
create or replace function public.content_client_idea_quota(p_workspace uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.content_is_member(p_workspace) or public.content_is_staff() then jsonb_build_object(
    'used', (select count(*) from public.content_idea_requests r
             where r.workspace_id = p_workspace and r.by_client and r.status <> 'failed'
               and r.created_at >= date_trunc('month', now())),
    'limit', (select w.idea_requests_per_month from public.content_workspaces w where w.id = p_workspace)
  ) end;
$$;

create or replace function public.content_client_request_ideas(p_workspace uuid, p_form text, p_style text, p_topic text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q jsonb;
  new_id uuid;
  per int;
begin
  if not public.content_is_member(p_workspace) or not public.content_can(p_workspace, 'can_generate_ideas') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- One request at a time per workspace keeps usage predictable.
  perform pg_advisory_xact_lock(hashtext(p_workspace::text));
  q := public.content_client_idea_quota(p_workspace);
  if (q->>'used')::int >= (q->>'limit')::int then
    raise exception 'You have used all % idea requests for this month.', q->>'limit' using errcode = '22023';
  end if;
  if exists (select 1 from public.content_idea_requests where workspace_id = p_workspace and status in ('pending', 'writing')) then
    raise exception 'Ideas are already being written. Try again in a minute.' using errcode = '22023';
  end if;
  select ideas_per_request into per from public.content_workspaces where id = p_workspace;
  insert into public.content_idea_requests (workspace_id, form, style, topic, count, by_client, requested_by)
  values (p_workspace, case when p_form = 'long' then 'long' else 'short' end, left(coalesce(nullif(trim(p_style), ''), 'Claude picks'), 60),
          left(nullif(trim(p_topic), ''), 500), per, true, (select auth.uid()))
  returning id into new_id;
  insert into public.content_audit (workspace_id, actor_id, actor_label, action, entity, entity_id, detail)
  values (p_workspace, (select auth.uid()), 'client', 'ideas_requested', 'idea_request', new_id, jsonb_build_object('form', p_form, 'style', p_style));
  return new_id;
end $$;

revoke execute on function public.content_client_idea_quota(uuid), public.content_client_request_ideas(uuid, text, text, text) from public;
grant execute on function public.content_client_idea_quota(uuid), public.content_client_request_ideas(uuid, text, text, text) to authenticated;
