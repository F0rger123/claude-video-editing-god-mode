-- Passkeys: people see and remove only their own; nobody inserts or edits through the API.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'p1@a.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'p2@b.test');
insert into public.content_passkeys (user_id, credential_id, public_key) values
  ('00000000-0000-0000-0000-0000000000d1', 'cred-1', 'pk1'),
  ('00000000-0000-0000-0000-0000000000d2', 'cred-2', 'pk2');

create or replace function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', label, expected, actual; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select pg_temp.expect('sees own passkey only', (select count(*) from public.content_passkeys), 1);
do $$ begin
  insert into public.content_passkeys (user_id, credential_id, public_key) values ('00000000-0000-0000-0000-0000000000d1', 'forged', 'x');
  raise exception 'FAIL: user inserted a passkey';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.content_passkeys set counter = 0;
  raise exception 'FAIL: user updated a passkey';
exception when insufficient_privilege then null;
end $$;
delete from public.content_passkeys where credential_id = 'cred-2';
delete from public.content_passkeys where credential_id = 'cred-1';

reset role;
select pg_temp.expect('other user passkey untouched', (select count(*) from public.content_passkeys where credential_id = 'cred-2'), 1);
select pg_temp.expect('own passkey removed', (select count(*) from public.content_passkeys where credential_id = 'cred-1'), 0);
rollback;
\echo 'passkey tests passed'
