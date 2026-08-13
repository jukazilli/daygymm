begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(35);

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
  has_column_privilege('authenticated', 'api.profiles', 'user_id', 'insert'),
  'authenticated can provide their profile user id'
);
select ok(
  has_column_privilege('authenticated', 'api.profiles', 'is_adult', 'insert'),
  'authenticated can provide the adult declaration'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'api.profiles',
    'adult_declared_at',
    'insert'
  ),
  'the database owns the adult declaration timestamp'
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
  has_column_privilege('authenticated', 'api.consents', 'user_id', 'insert'),
  'authenticated can provide their consent user id'
);
select ok(
  has_column_privilege('authenticated', 'api.consents', 'document', 'insert'),
  'authenticated can provide the accepted document'
);
select ok(
  has_column_privilege(
    'authenticated',
    'api.consents',
    'document_version',
    'insert'
  ),
  'authenticated can provide the document version'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'api.consents',
    'accepted_at',
    'insert'
  ),
  'the database owns the acceptance timestamp'
);
select ok(
  not has_table_privilege('authenticated', 'api.consents', 'update'),
  'acceptance history is append-only'
);
select ok(
  not has_table_privilege('authenticated', 'api.consents', 'delete'),
  'acceptance history cannot be deleted directly'
);

insert into auth.users (instance_id, id, aud, role, email)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'fnd010-a@example.invalid'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'fnd010-b@example.invalid'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.profiles (user_id, is_adult)
      values ('10000000-0000-0000-0000-000000000001', false)$$,
    '23514'
  ),
  'a declared minor cannot create an eligible profile'
);
select lives_ok(
  $$insert into api.profiles (user_id, is_adult)
    values ('10000000-0000-0000-0000-000000000001', true)$$,
  'a user can create their own adult profile'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.profiles (user_id, is_adult)
      values ('20000000-0000-0000-0000-000000000002', true)$$,
    '42501'
  ),
  'a user cannot create another user profile'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select lives_ok(
  $$insert into api.profiles (user_id, is_adult)
    values ('20000000-0000-0000-0000-000000000002', true)$$,
  'the second user can create their own profile'
);

reset role;
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
select lives_ok(
  $$insert into api.consents (user_id, document, document_version)
    values (
      '10000000-0000-0000-0000-000000000001',
      'terms_of_service',
      '2026-08-13'
    )$$,
  'a user can accept the current terms'
);
select lives_ok(
  $$insert into api.consents (user_id, document, document_version)
    values (
      '10000000-0000-0000-0000-000000000001',
      'privacy_notice',
      '2026-08-13'
    )$$,
  'a user can acknowledge the current privacy notice'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.consents (user_id, document, document_version)
      values (
        '20000000-0000-0000-0000-000000000002',
        'terms_of_service',
        '2026-08-13'
      )$$,
    '42501'
  ),
  'a user cannot record acceptance for another user'
);
select is(
  (select count(*) from api.consents),
  2::bigint,
  'a user sees their two required document acceptances'
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
    $$insert into api.consents (user_id, document, document_version)
      values (
        '10000000-0000-0000-0000-000000000001',
        'terms_of_service',
        ' '
      )$$,
    '23514'
  ),
  'a blank document version is rejected'
);
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.consents (user_id, document, document_version)
      values (
        '10000000-0000-0000-0000-000000000001',
        'terms_of_service',
        '2026-08-13'
      )$$,
    '23505'
  ),
  'the same document version cannot be accepted twice'
);

select * from finish();
rollback;
