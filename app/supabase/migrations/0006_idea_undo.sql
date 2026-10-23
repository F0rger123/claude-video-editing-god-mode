-- ═══════════════════════════════════════════════════════════════════════════
-- God Mode Cut — 0006: undo a swipe
-- Clients may put an idea back in the deck ('new') right after deciding on it,
-- but only an idea they decided themselves.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.content_client_script(p_idea uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.content_script_ideas;
begin
  select * into s from public.content_script_ideas where id = p_idea;
  if s.id is null or s.status = 'archived' then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public.content_is_member(s.workspace_id) or not public.content_can(s.workspace_id, 'can_swipe_scripts') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status = 'new' then
    if s.decided_by is distinct from (select auth.uid()) or s.status = 'recorded' then
      raise exception 'Only your own last choice can be undone.' using errcode = '42501';
    end if;
    update public.content_script_ideas set status = 'new', reason = null, decided_by = null, decided_at = null where id = s.id;
    return;
  end if;
  if p_status not in ('liked', 'passed', 'saved') then raise exception 'Unknown choice' using errcode = '22023'; end if;
  update public.content_script_ideas
     set status = p_status, reason = left(nullif(trim(p_reason), ''), 500), decided_by = (select auth.uid()), decided_at = now()
   where id = s.id;
  insert into public.content_audit (workspace_id, actor_id, actor_label, action, entity, entity_id)
  values (s.workspace_id, (select auth.uid()), 'client', 'script_' || p_status, 'script', s.id);
end $$;
