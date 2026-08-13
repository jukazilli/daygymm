-- FND-013: create eligibility and required acceptances atomically with Auth.
begin;

create table private.legal_document_versions (
  document text not null,
  document_version text not null,
  environment text not null,
  is_active boolean not null default false,
  published_at timestamptz not null default statement_timestamp(),
  primary key (document, document_version),
  constraint legal_document_versions_supported_document check (
    document in ('terms_of_service', 'privacy_notice')
  ),
  constraint legal_document_versions_environment check (
    environment in ('staging', 'production')
  ),
  constraint legal_document_versions_version_not_blank check (
    char_length(btrim(document_version)) between 1 and 64
  )
);

comment on table private.legal_document_versions is
  'Server-owned allowlist of document versions accepted during account creation.';

insert into private.legal_document_versions (
  document,
  document_version,
  environment,
  is_active
)
values
  ('terms_of_service', '2026-08-13', 'staging', true),
  ('privacy_notice', '2026-08-13', 'staging', true);

revoke all on table private.legal_document_versions
from public, anon, authenticated;

drop policy profiles_insert_own on api.profiles;
drop policy consents_insert_own on api.consents;
revoke insert on table api.profiles from authenticated;
revoke insert on table api.consents from authenticated;
revoke insert (user_id, is_adult) on table api.profiles from authenticated;
revoke insert (user_id, document, document_version)
on table api.consents from authenticated;

create function private.initialize_identity_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms_version text := btrim(
    coalesce(metadata ->> 'daygym_terms_version', '')
  );
  privacy_version text := btrim(
    coalesce(metadata ->> 'daygym_privacy_version', '')
  );
begin
  if metadata ->> 'daygym_account_creation' <> 'v1' then
    raise exception using
      errcode = '23514',
      message = 'Account creation context is invalid.';
  end if;

  if jsonb_typeof(metadata -> 'daygym_is_adult') is distinct from 'boolean'
    or not (metadata ->> 'daygym_is_adult')::boolean
  then
    raise exception using
      errcode = '23514',
      message = 'Adult eligibility declaration is required.';
  end if;

  if not exists (
    select 1
    from private.legal_document_versions as version
    where version.document = 'terms_of_service'
      and version.document_version = terms_version
      and version.environment = 'staging'
      and version.is_active
  ) then
    raise exception using
      errcode = '23514',
      message = 'Terms version is not accepted.';
  end if;

  if not exists (
    select 1
    from private.legal_document_versions as version
    where version.document = 'privacy_notice'
      and version.document_version = privacy_version
      and version.environment = 'staging'
      and version.is_active
  ) then
    raise exception using
      errcode = '23514',
      message = 'Privacy notice version is not accepted.';
  end if;

  insert into api.profiles (user_id, is_adult)
  values (new.id, true);

  insert into api.consents (user_id, document, document_version)
  values
    (new.id, 'terms_of_service', terms_version),
    (new.id, 'privacy_notice', privacy_version);

  return new;
end;
$$;

comment on function private.initialize_identity_from_auth_user() is
  'Fails account creation closed unless eligibility and active required document versions are valid.';

revoke all on function private.initialize_identity_from_auth_user()
from public, anon, authenticated;

create trigger initialize_daygym_identity
after insert on auth.users
for each row
execute function private.initialize_identity_from_auth_user();

commit;
