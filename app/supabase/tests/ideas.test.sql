-- Client idea requests: permission + monthly limit + one at a time.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'a@a.test'), ('00000000-0000-0000-0000-0000000000c2', 'b@b.test');
insert into public.content_workspaces (id, name, slug, idea_requests_per_month) values
  ('a0000000-0000-0000-0000-000000000000', 'A', 'a-ideas', 1),
  ('b0000000-0000-0000-0000-000000000000', 'B', 'b-ideas', 5);
insert into public.content_members (workspace_id, user_id, invited_email, permissions) values
  ('a0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'a@a.test', '{"can_generate_ideas": true, "can_view_scripts": true}'),
  ('b0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'b@b.test', '{"can_view_scripts": true}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.content_client_request_ideas('a0000000-0000-0000-0000-000000000000', 'long', 'Story', 'decks');
do $$ begin
  perform public.content_client_request_ideas('a0000000-0000-0000-0000-000000000000', 'short', 'Tips');
  raise exception 'FAIL: second request allowed past limit 1';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  perform public.content_client_request_ideas('b0000000-0000-0000-0000-000000000000', 'short', 'Tips');
  raise exception 'FAIL: requested for another workspace';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  perform public.content_client_request_ideas('b0000000-0000-0000-0000-000000000000', 'short', 'Tips');
  raise exception 'FAIL: requested without can_generate_ideas';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if (select count(*) from public.content_idea_requests) <> 0 then raise exception 'FAIL: B sees requests'; end if;
end $$;
rollback;
\echo 'idea tests passed'
