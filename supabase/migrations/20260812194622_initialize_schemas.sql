-- M0 starts closed: no application relation, function or storage policy is exposed
-- until a later migration adds an authorized use case and its negative RLS test.
begin;

create schema if not exists api;
create schema if not exists private;

revoke all on schema public from public;
revoke all on schema public from anon, authenticated;
revoke all on schema api from public;
revoke all on schema api from anon, authenticated;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

alter default privileges for role postgres in schema api revoke all on tables from public;
alter default privileges for role postgres in schema api revoke all on sequences from public;
alter default privileges for role postgres in schema api revoke execute on functions from public;

alter default privileges for role postgres in schema private revoke all on tables from public;
alter default privileges for role postgres in schema private revoke all on sequences from public;
alter default privileges for role postgres in schema private revoke execute on functions from public;

commit;
