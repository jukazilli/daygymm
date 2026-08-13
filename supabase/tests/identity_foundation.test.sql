begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(41);

create or replace function pg_temp.raises_sqlstate(
  statement text,
  expected_sqlstate text
)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return sqlstate = expected_sqlstate;
end;
$$;

select has_table('api', 'profiles', 'profiles table exists');
select has_table('api', 'consents', 'consents table exists');
select has_table(
  'private',
  'legal_document_versions',
  'the server owns accepted document versions'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'api.consents'::regclass
      and confrelid = 'api.profiles'::regclass
      and contype = 'f'
  ),
  'consent acceptance requires an eligible profile'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'api.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.profiles'::regclass),
  'profiles forces RLS for table owners'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.consents'::regclass),
  'consents has RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.consents'::regclass),
  'consents forces RLS for table owners'
);
select has_trigger(
  'auth',
  'users',
  'initialize_daygym_identity',
  'new Auth users initialize DayGym identity atomically'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.initialize_identity_from_auth_user()'::regprocedure
  ),
  'the trigger function has the required definer boundary'
);

select ok(
  has_schema_privilege('authenticated', 'api', 'usage'),
  'authenticated can use the api schema'
);
select ok(
  not has_schema_privilege('anon', 'api', 'usage'),
  'anonymous users cannot use the api schema'
);
select ok(
  has_table_privilege('authenticated', 'api.profiles', 'select'),
  'authenticated can select profiles through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'api.profiles', 'insert'),
  'clients cannot create eligibility directly'
);
select ok(
  not has_column_privilege('authenticated', 'api.profiles', 'user_id', 'insert')
    and not has_column_privilege(
      'authenticated',
      'api.profiles',
      'is_adult',
      'insert'
    ),
  'clients have no remaining column-level profile inserts'
);
select ok(
  not has_table_privilege('authenticated', 'api.profiles', 'update'),
  'the adult declaration cannot be changed'
);
select ok(
  not has_table_privilege('authenticated', 'api.profiles', 'delete'),
  'profiles cannot be deleted directly'
);
select ok(
  has_table_privilege('authenticated', 'api.consents', 'select'),
  'authenticated can select their acceptance history through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'api.consents', 'insert'),
  'clients cannot create acceptance evidence directly'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'api.consents',
    'user_id',
    'insert'
  )
    and not has_column_privilege(
      'authenticated',
      'api.consents',
      'document',
      'insert'
    )
    and not has_column_privilege(
      'authenticated',
      'api.consents',
      'document_version',
      'insert'
    ),
  'clients have no remaining column-level consent inserts'
);
select ok(
  not has_table_privilege('authenticated', 'api.consents', 'update'),
  'acceptance history is append-only'
);
select ok(
  not has_table_privilege('authenticated', 'api.consents', 'delete'),
  'acceptance history cannot be deleted directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.legal_document_versions',
    'select'
  ),
  'clients cannot read the private version registry'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.initialize_identity_from_auth_user()',
    'execute'
  ),
  'clients cannot execute the identity trigger function'
);

select lives_ok(
  $$insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '10000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'fnd013-a@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'valid metadata creates the first identity'
);
select lives_ok(
  $$insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '20000000-0000-0000-0000-000000000002',
      'authenticated',
      'authenticated',
      'fnd013-b@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'valid metadata creates the second identity'
);
select is(
  (select count(*) from api.profiles),
  2::bigint,
  'each valid Auth user receives one eligible profile'
);
select is(
  (select count(*) from api.consents),
  4::bigint,
  'each valid Auth user receives two required acceptances'
);
select is(
  (
    select count(*)
    from api.consents
    where document_version = '2026-08-13'
  ),
  4::bigint,
  'the accepted versions are the server allowlisted versions'
);

select ok(
  pg_temp.raises_sqlstate(
    $$insert into auth.users (instance_id, id, aud, role, email)
      values (
        '00000000-0000-0000-0000-000000000000',
        '30000000-0000-0000-0000-000000000003',
        'authenticated',
        'authenticated',
        'missing-context@example.invalid'
      )$$,
    '23514'
  ),
  'missing account context is rejected'
);
select is(
  (
    select count(*)
    from auth.users
    where id = '30000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'a rejected context leaves no orphan Auth user'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into auth.users (
        instance_id, id, aud, role, email, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000',
        '40000000-0000-0000-0000-000000000004',
        'authenticated',
        'authenticated',
        'minor@example.invalid',
        '{
          "daygym_account_creation": "v1",
          "daygym_is_adult": false,
          "daygym_terms_version": "2026-08-13",
          "daygym_privacy_version": "2026-08-13"
        }'::jsonb
      )$$,
    '23514'
  ),
  'a declared minor is rejected'
);
select is(
  (
    select count(*)
    from auth.users
    where id = '40000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'a rejected minor leaves no orphan Auth user'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into auth.users (
        instance_id, id, aud, role, email, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000',
        '50000000-0000-0000-0000-000000000005',
        'authenticated',
        'authenticated',
        'wrong-terms@example.invalid',
        '{
          "daygym_account_creation": "v1",
          "daygym_is_adult": true,
          "daygym_terms_version": "unknown",
          "daygym_privacy_version": "2026-08-13"
        }'::jsonb
      )$$,
    '23514'
  ),
  'an unknown terms version is rejected'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into auth.users (
        instance_id, id, aud, role, email, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000',
        '60000000-0000-0000-0000-000000000006',
        'authenticated',
        'authenticated',
        'wrong-privacy@example.invalid',
        '{
          "daygym_account_creation": "v1",
          "daygym_is_adult": true,
          "daygym_terms_version": "2026-08-13",
          "daygym_privacy_version": "unknown"
        }'::jsonb
      )$$,
    '23514'
  ),
  'an unknown privacy version is rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*) from api.profiles),
  1::bigint,
  'a user sees exactly their own profile'
);
select is(
  (
    select count(*)
    from api.profiles
    where user_id = '20000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'another user profile is hidden by RLS'
);
select is(
  (select count(*) from api.consents),
  2::bigint,
  'a user sees exactly their two required acceptances'
);
select is(
  (
    select count(*)
    from api.consents
    where user_id = '20000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'another user acceptance history is hidden by RLS'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.profiles (user_id, is_adult)
      values ('10000000-0000-0000-0000-000000000001', true)$$,
    '42501'
  ),
  'a client cannot forge an eligible profile'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.consents (user_id, document, document_version)
      values (
        '10000000-0000-0000-0000-000000000001',
        'terms_of_service',
        '2026-08-13'
      )$$,
    '42501'
  ),
  'a client cannot forge acceptance evidence'
);

select * from finish();
rollback;
