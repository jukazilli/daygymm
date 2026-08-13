begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(27);

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

select has_table(
  'api',
  'onboarding_contexts',
  'the resumable onboarding context exists'
);
select has_function(
  'api',
  'save_onboarding_context',
  array[
    'smallint',
    'text',
    'text',
    'smallint',
    'smallint',
    'text',
    'text',
    'boolean'
  ],
  'the owner-scoped save command exists'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'api.onboarding_contexts'::regclass
  ),
  'onboarding contexts have RLS enabled'
);
select ok(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'api.onboarding_contexts'::regclass
  ),
  'onboarding contexts force RLS'
);
select ok(
  has_table_privilege('authenticated', 'api.onboarding_contexts', 'select'),
  'authenticated clients can read their context through RLS'
);
select ok(
  has_column_privilege(
      'authenticated',
      'api.onboarding_contexts',
      'goal',
      'insert'
    )
    and has_column_privilege(
      'authenticated',
      'api.onboarding_contexts',
      'goal',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'api.onboarding_contexts',
      'delete'
    ),
  'authenticated writes are bounded by column grants and RLS'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.save_onboarding_context(smallint,text,text,smallint,smallint,text,text,boolean)',
    'execute'
  ),
  'anonymous clients cannot execute the save command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.save_onboarding_context(smallint,text,text,smallint,smallint,text,text,boolean)',
    'execute'
  ),
  'authenticated clients can execute the bounded save command'
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
      '71000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'onboarding-a@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the first eligible test owner exists'
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
      '72000000-0000-0000-0000-000000000002',
      'authenticated',
      'authenticated',
      'onboarding-b@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the second eligible test owner exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*) from api.onboarding_contexts),
  0::bigint,
  'a new owner starts without a context'
);
select lives_ok(
  $$select api.save_onboarding_context(
      1,
      'health_return',
      null,
      null,
      null,
      null,
      null,
      false
    )$$,
  'the first step is saved immediately'
);
select is(
  (select count(*) from api.onboarding_contexts),
  1::bigint,
  'the owner sees one saved draft'
);
select is(
  (select goal from api.onboarding_contexts),
  'health_return',
  'the selected goal is persisted'
);
select is(
  (select current_step from api.onboarding_contexts),
  1::smallint,
  'the resume step is persisted'
);
-- RLS-N12: one authenticated owner cannot write another owner context.
select ok(
  pg_temp.raises_sqlstate(
    $$insert into api.onboarding_contexts (user_id, goal, current_step)
      values (
        '72000000-0000-0000-0000-000000000002',
        'conditioning',
        1
      )$$,
    '42501'
  ),
  'an owner cannot insert a context for another owner'
);
select ok(
  pg_temp.raises_sqlstate(
    $$update api.onboarding_contexts set current_step = 6$$,
    '23514'
  ),
  'direct writes cannot skip required answers'
);
select ok(
  pg_temp.raises_sqlstate(
    $$delete from api.onboarding_contexts$$,
    '42501'
  ),
  'a client cannot delete the table directly'
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.save_onboarding_context(
        1,
        'miracle_result',
        null,
        null,
        null,
        null,
        null,
        false
      )$$,
    '23514'
  ),
  'an unsupported goal fails closed'
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.save_onboarding_context(
        6,
        'health_return',
        'beginner',
        3,
        45,
        'full_gym',
        null,
        true
      )$$,
    '23514'
  ),
  'completion without every minimum answer fails closed'
);
select lives_ok(
  $$select api.save_onboarding_context(
      6,
      'health_return',
      'beginner',
      3,
      45,
      'full_gym',
      'not_informed',
      true
    )$$,
  'a complete minimum context is accepted'
);
select ok(
  (
    select current_step = 6
      and completed_at is not null
      and experience = 'beginner'
      and weekly_days = 3
      and session_minutes = 45
    from api.onboarding_contexts
  ),
  'the completed state contains the expected minimum context'
);

select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000002',
  true
);

-- RLS-N11: one authenticated owner cannot read another onboarding context.
select is(
  (select count(*) from api.onboarding_contexts),
  0::bigint,
  'another owner context is hidden by RLS'
);
select lives_ok(
  $$select api.save_onboarding_context(
      1,
      'conditioning',
      null,
      null,
      null,
      null,
      null,
      false
    )$$,
  'the second owner can save an independent draft'
);
select is(
  (select count(*) from api.onboarding_contexts),
  1::bigint,
  'the second owner sees only one context'
);
select is(
  (select goal from api.onboarding_contexts),
  'conditioning',
  'the second owner sees only their own answer'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select goal from api.onboarding_contexts),
  'health_return',
  'the first owner context was not overwritten'
);

select * from finish();
rollback;
