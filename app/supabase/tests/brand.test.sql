-- Brand kits + projects: clients read only their own, never write.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'b1@a.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'b2@b.test');
insert into public.content_workspaces (id, name, slug) values
  ('a1000000-0000-0000-0000-000000000000', 'BA', 'ba-ws'),
  ('b1000000-0000-0000-0000-000000000000', 'BB', 'bb-ws');
insert into public.content_members (workspace_id, user_id, invited_email, permissions) values
  ('a1000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'b1@a.test', '{"can_upload": true}'),
  ('b1000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'b2@b.test', '{"can_upload": true}');
insert into public.content_projects (id, workspace_id, name) values
  ('a1100000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'A launch'),
  ('b1100000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'B launch');
insert into public.content_brand_assets (workspace_id, kind, name, value, is_primary) values
  ('a1000000-0000-0000-0000-000000000000', 'color', 'A red', '#ff0000', true),
  ('b1000000-0000-0000-0000-000000000000', 'color', 'B blue', '#0000ff', true);

create or replace function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', label, expected, actual; end if;
end $$;

-- Only one primary color per client.
do $$ begin
  insert into public.content_brand_assets (workspace_id, kind, name, value, is_primary) values ('a1000000-0000-0000-0000-000000000000', 'color', 'A second', '#00ff00', true);
  raise exception 'FAIL: two primary colors';
exception when unique_violation then null;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select pg_temp.expect('client sees own kit only', (select count(*) from public.content_brand_assets), 1);
select pg_temp.expect('client sees own projects only', (select count(*) from public.content_projects), 1);
do $$ begin
  insert into public.content_brand_assets (workspace_id, kind, name, value) values ('a1000000-0000-0000-0000-000000000000', 'color', 'sneaky', '#123456');
  raise exception 'FAIL: client wrote a brand asset';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.content_projects (workspace_id, name) values ('a1000000-0000-0000-0000-000000000000', 'sneaky');
  raise exception 'FAIL: client created a project';
exception when insufficient_privilege then null;
end $$;
update public.content_projects set name = 'renamed';
reset role;
select pg_temp.expect('client update ignored', (select count(*) from public.content_projects where name = 'renamed'), 0);
rollback;
\echo 'brand tests passed'
