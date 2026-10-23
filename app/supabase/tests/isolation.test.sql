-- Workspace isolation: owner / client A / client B / stranger / anon.
-- Runs as superuser for setup, then `set role authenticated` + a JWT sub per actor.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@az.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'client-a@a.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'client-b@b.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@x.test');
insert into public.content_staff (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'owner');

insert into public.content_workspaces (id, name, slug, is_agency) values
  ('10000000-0000-0000-0000-000000000000', 'Studio HQ', 'studio-hq', true),
  ('a0000000-0000-0000-0000-000000000000', 'Client A', 'client-a', false),
  ('b0000000-0000-0000-0000-000000000000', 'Client B', 'client-b', false);

insert into public.content_members (workspace_id, user_id, invited_email, permissions) values
  ('a0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'client-a@a.test',
   '{"can_upload": true, "can_view_drafts": true, "can_comment": true, "can_approve": true, "can_view_calendar": true}'),
  ('b0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'client-b@b.test',
   '{"can_upload": true}');

insert into public.content_jobs (id, workspace_id, title, status, review_stage) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'A reel', 'review', 'client'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'B reel', 'review', 'agency'),
  ('11000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000', 'AZ reel', 'editing', null);
insert into public.content_job_internal (job_id, workspace_id, agency_notes) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'secret agency note');
insert into public.content_versions (id, job_id, workspace_id, number, storage_path, client_visible) values
  ('a2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 1, 'a/v1.mp4', true),
  ('a3000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 2, 'a/v2.mp4', false);
insert into public.content_feedback (job_id, version_id, workspace_id, body, internal) values
  ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'internal only', true),
  ('a1000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'visible', false);
insert into public.content_channels (id, workspace_id, buffer_channel_id, platform, name) values
  ('a4000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'buf-a', 'instagram', 'a_ig'),
  ('b4000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'buf-b', 'instagram', 'b_ig');
insert into public.content_secrets (workspace_id, kind, value) values
  ('a0000000-0000-0000-0000-000000000000', 'buffer_api_key', 'sk-secret');

-- Cross-workspace publishing guard: B's channel can never carry A's post.
do $$ begin
  begin
    insert into public.content_posts (job_id, workspace_id, channel_id, platform)
    values ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000',
            'b4000000-0000-0000-0000-000000000000', 'instagram');
    raise exception 'FAIL: cross-workspace channel accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.content_versions (job_id, workspace_id, number, storage_path)
    values ('a1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 9, 'x');
    raise exception 'FAIL: version with mismatched workspace accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

create or replace function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', label, expected, actual; end if;
end $$;

-- ── Owner sees everything except secrets ──
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.expect('owner workspaces', (select count(*) from public.content_workspaces), 3);
select pg_temp.expect('owner jobs', (select count(*) from public.content_jobs), 3);
select pg_temp.expect('owner internal', (select count(*) from public.content_job_internal), 1);
do $$ begin
  perform 1 from public.content_secrets;
  raise exception 'FAIL: secrets readable by owner session';
exception when insufficient_privilege then null;
end $$;

-- ── Client A: only own workspace, only released versions, no internal data ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.expect('A workspaces table', (select count(*) from public.content_workspaces), 0);
select pg_temp.expect('A jobs', (select count(*) from public.content_jobs), 1);
select pg_temp.expect('A job is own', (select count(*) from public.content_jobs where workspace_id = 'a0000000-0000-0000-0000-000000000000'), 1);
select pg_temp.expect('A internal', (select count(*) from public.content_job_internal), 0);
select pg_temp.expect('A versions (released only)', (select count(*) from public.content_versions), 1);
select pg_temp.expect('A feedback (not internal)', (select count(*) from public.content_feedback), 1);
select pg_temp.expect('A channels', (select count(*) from public.content_channels), 0);
select pg_temp.expect('A members (self only)', (select count(*) from public.content_members), 1);
select pg_temp.expect('A audit', (select count(*) from public.content_audit), 0);
select pg_temp.expect('A portal ok', (select count(*) from (select public.content_portal_workspace('client-a') as p) x where p is not null), 1);
select pg_temp.expect('A portal of B denied', (select count(*) from (select public.content_portal_workspace('client-b') as p) x where p is not null), 0);
do $$ begin
  update public.content_jobs set status = 'approved' where id = 'a1000000-0000-0000-0000-000000000000';
  if found then raise exception 'FAIL: client updated a job directly'; end if;
end $$;
do $$ begin
  insert into public.content_jobs (workspace_id, title) values ('a0000000-0000-0000-0000-000000000000', 'x');
  raise exception 'FAIL: client inserted a job directly';
exception when insufficient_privilege then null;
end $$;
-- Client cannot decide on B's version, nor on an unreleased one.
do $$ begin
  perform public.content_client_decide('a3000000-0000-0000-0000-000000000000', 'approved');
  raise exception 'FAIL: decided on unreleased version';
exception when no_data_found then null;
end $$;
-- Client A approves released V1 (has can_approve).
select public.content_client_decide('a2000000-0000-0000-0000-000000000000', 'approved', 'Looks great');

-- ── Client B: sees nothing of A, no drafts permission ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select pg_temp.expect('B jobs', (select count(*) from public.content_jobs), 0);
select pg_temp.expect('B versions', (select count(*) from public.content_versions), 0);
select pg_temp.expect('B sees no A feedback', (select count(*) from public.content_feedback), 0);
do $$ begin
  perform public.content_client_comment('a2000000-0000-0000-0000-000000000000', 'hi');
  raise exception 'FAIL: B commented on A';
exception when insufficient_privilege then null;
end $$;

-- ── Stranger: nothing ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select pg_temp.expect('stranger jobs', (select count(*) from public.content_jobs), 0);
select pg_temp.expect('stranger notifications', (select count(*) from public.content_notifications), 0);
select pg_temp.expect('stranger portals', (select jsonb_array_length(public.content_my_portals())), 0);

-- ── Revoked membership loses access immediately ──
reset role;
update public.content_members set revoked_at = now() where user_id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.expect('revoked A jobs', (select count(*) from public.content_jobs), 0);
select pg_temp.expect('revoked A portal', (select count(*) from (select public.content_portal_workspace('client-a') as p) x where p is not null), 0);

-- ── Anon: nothing at all ──
reset role;
set local role anon;
do $$ begin
  perform 1 from public.content_jobs;
  raise exception 'FAIL: anon can read jobs';
exception when insufficient_privilege then null;
end $$;

reset role;
-- Approval by client A was audited and moved the job.
select pg_temp.expect('approved job', (select count(*) from public.content_jobs where id = 'a1000000-0000-0000-0000-000000000000' and status = 'approved'), 1);
select pg_temp.expect('audit rows', (select count(*) from public.content_audit where action = 'client_approved'), 1);

rollback;
\echo 'isolation tests passed'
