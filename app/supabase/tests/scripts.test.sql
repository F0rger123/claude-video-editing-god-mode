-- Script ideas + style presets isolation.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'a@a.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'b@b.test');
insert into public.content_workspaces (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000000', 'A', 'a-ws'),
  ('b0000000-0000-0000-0000-000000000000', 'B', 'b-ws');
insert into public.content_members (workspace_id, user_id, invited_email, permissions) values
  ('a0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'a@a.test', '{"can_view_scripts": true, "can_swipe_scripts": true, "can_upload": true}'),
  ('b0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'b@b.test', '{"can_view_scripts": true}');
insert into public.content_script_ideas (id, workspace_id, hook) values
  ('a5000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'A hook'),
  ('b5000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'B hook');
insert into public.content_style_presets (workspace_id, kind, name) values
  ('a0000000-0000-0000-0000-000000000000', 'captions', 'A captions'),
  ('b0000000-0000-0000-0000-000000000000', 'captions', 'B captions');

create or replace function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', label, expected, actual; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.expect('A sees own ideas only', (select count(*) from public.content_script_ideas), 1);
select pg_temp.expect('A sees own presets only', (select count(*) from public.content_style_presets), 1);
select public.content_client_script('a5000000-0000-0000-0000-000000000000', 'passed', 'too salesy');
select public.content_client_script('a5000000-0000-0000-0000-000000000000', 'new');
select pg_temp.expect('undo puts it back', (select count(*) from public.content_script_ideas where status = 'new' and id = 'a5000000-0000-0000-0000-000000000000'), 1);
select public.content_client_script('a5000000-0000-0000-0000-000000000000', 'passed', 'too salesy');
select pg_temp.expect('A added idea', (select count(*) from (select public.content_client_add_script('a0000000-0000-0000-0000-000000000000', 'My hook')) x), 1);
do $$ begin
  perform public.content_client_script('b5000000-0000-0000-0000-000000000000', 'liked');
  raise exception 'FAIL: A swiped B idea';
exception when insufficient_privilege then null;
end $$;

-- B may view but not swipe.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select pg_temp.expect('B sees own idea', (select count(*) from public.content_script_ideas), 1);
do $$ begin
  perform public.content_client_script('b5000000-0000-0000-0000-000000000000', 'liked');
  raise exception 'FAIL: B swiped without can_swipe_scripts';
exception when insufficient_privilege then null;
end $$;

reset role;
select pg_temp.expect('pass reason stored', (select count(*) from public.content_script_ideas where reason = 'too salesy' and status = 'passed'), 1);
rollback;
\echo 'script tests passed'
