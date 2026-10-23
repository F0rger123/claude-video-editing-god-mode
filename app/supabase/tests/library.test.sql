-- Library is staff-only.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'a@a.test');
insert into public.content_workspaces (id, name, slug) values ('a0000000-0000-0000-0000-000000000000', 'A', 'a-lib');
insert into public.content_members (workspace_id, user_id, invited_email, permissions) values
  ('a0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'a@a.test', '{"can_upload": true, "can_view_drafts": true}');
insert into public.content_library (workspace_id, kind, name, local_path) values
  (null, 'sfx', 'Hit 01', 'C:\x\Hit 01.wav'),
  ('a0000000-0000-0000-0000-000000000000', 'sfx', 'A whoosh', 'C:\x\w.wav');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin
  if (select count(*) from public.content_library) <> 0 then raise exception 'FAIL: client sees library'; end if;
end $$;
rollback;
\echo 'library tests passed'
