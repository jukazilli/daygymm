-- FND-010: minimal identity data required by US-001.
-- Authentication credentials remain owned by Supabase Auth. The API schema stores
-- only the adult declaration and the required document acceptances.
begin;

create table api.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_adult boolean not null,
  adult_declared_at timestamptz not null default statement_timestamp(),
  constraint profiles_adults_only check (is_adult)
);

comment on table api.profiles is
  'Minimal account eligibility linked one-to-one with Supabase Auth.';
comment on column api.profiles.is_adult is
  'User declaration that they are at least 18 years old; false is rejected.';

create table api.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references api.profiles (user_id) on delete cascade,
  document text not null,
  document_version text not null,
  accepted_at timestamptz not null default statement_timestamp(),
  constraint consents_supported_document check (
    document in ('terms_of_service', 'privacy_notice')
  ),
  constraint consents_version_not_blank check (
    char_length(btrim(document_version)) between 1 and 64
  ),
  constraint consents_acceptance_once unique (
    user_id,
    document,
    document_version
  )
);

comment on table api.consents is
  'Append-only acceptance history for documents required by account creation.';
comment on column api.consents.document_version is
  'Immutable version identifier of the accepted legal document.';

alter table api.profiles enable row level security;
alter table api.profiles force row level security;
alter table api.consents enable row level security;
alter table api.consents force row level security;

create policy profiles_select_own
on api.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_insert_own
on api.profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy consents_select_own
on api.consents
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy consents_insert_own
on api.consents
for insert
to authenticated
with check ((select auth.uid()) = user_id);

revoke all on table api.profiles from public, anon, authenticated;
revoke all on table api.consents from public, anon, authenticated;

grant usage on schema api to authenticated;
grant select on table api.profiles to authenticated;
grant insert (user_id, is_adult) on table api.profiles to authenticated;
grant select on table api.consents to authenticated;
grant insert (user_id, document, document_version)
on table api.consents
to authenticated;

commit;
