begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

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

select has_column(
  'api',
  'onboarding_contexts',
  'plan_source',
  'onboarding stores the selected plan source'
);
select has_column(
  'api',
  'onboarding_contexts',
  'plan_source_selected_at',
  'onboarding stores the latest allowed selection time'
);
select has_function(
  'api',
  'select_plan_source',
  array['text'],
  'the owner-scoped source selection command exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.select_plan_source(text)',
    'execute'
  ),
  'anonymous clients cannot select a plan source'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.select_plan_source(text)',
    'execute'
  ),
  'authenticated clients can execute the bounded selection command'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'api.onboarding_contexts',
    'plan_source_selected_at',
    'update'
  ),
  'clients cannot forge the server selection time'
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
      '73000000-0000-0000-0000-000000000003',
      'authenticated',
      'authenticated',
      'plan-source-a@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the first eligible plan-source owner exists'
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
      '74000000-0000-0000-0000-000000000004',
      'authenticated',
      'authenticated',
      'plan-source-b@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the second eligible plan-source owner exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-0000-0000-000000000003',
  true
);

select lives_ok(
  $$select api.save_onboarding_context(
      6::smallint,
      'strength',
      'intermediate',
      3::smallint,
      45::smallint,
      'full_gym',
      'none',
      true
    )$$,
  'a reviewed context exists before source selection'
);
select is(
  (select plan_source from api.onboarding_contexts),
  null,
  'no path is pre-confirmed'
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.select_plan_source('unknown_path')$$,
    '23514'
  ),
  'a source outside the four approved paths fails closed'
);
select lives_ok(
  $$select api.select_plan_source('daygym_suggestion')$$,
  'the owner can select the DayGym suggestion path'
);
select is(
  (select plan_source from api.onboarding_contexts),
  'daygym_suggestion',
  'the selected path is persisted'
);
select ok(
  (select plan_source_selected_at is not null from api.onboarding_contexts),
  'the selection time is normalized by the server'
);
select lives_ok(
  $$select api.select_plan_source('official_xlsx')$$,
  'the owner can change paths before the first session'
);
select is(
  (select plan_source from api.onboarding_contexts),
  'official_xlsx',
  'the replacement path becomes canonical'
);

select set_config(
  'request.jwt.claim.sub',
  '74000000-0000-0000-0000-000000000004',
  true
);
select lives_ok(
  $$select api.save_onboarding_context(
      1::smallint,
      'conditioning',
      null,
      null,
      null,
      null,
      null,
      false
    )$$,
  'the second owner has only an incomplete onboarding draft'
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.select_plan_source('manual')$$,
    '23514'
  ),
  'an incomplete onboarding cannot select a plan source'
);
-- RLS-N13: one authenticated owner cannot read another plan-source selection.
select is(
  (
    select count(*)
    from api.onboarding_contexts
    where plan_source is not null
  ),
  0::bigint,
  'another owner plan-source selection is hidden by RLS'
);

reset role;
select lives_ok(
  $$insert into api.training_sessions (
      session_id,
      user_id,
      operation_id,
      completed_at,
      version,
      completion_event_id
    ) values (
      '73000000-0000-0000-0000-000000000103',
      '73000000-0000-0000-0000-000000000003',
      'plan-source-session-0003',
      statement_timestamp(),
      1,
      '73000000-0000-0000-0000-000000000203'
    )$$,
  'the first completed session exists for the selected owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-0000-0000-000000000003',
  true
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.select_plan_source('manual')$$,
    '23514'
  ),
  'the source cannot change after the first completed session'
);
select is(
  (select plan_source from api.onboarding_contexts),
  'official_xlsx',
  'a rejected change preserves the canonical source'
);
select ok(
  pg_temp.raises_sqlstate(
    $$update api.onboarding_contexts set plan_source = 'professional'$$,
    '23514'
  ),
  'a direct column update cannot bypass the first-session guard'
);
select is(
  (select plan_source from api.onboarding_contexts),
  'official_xlsx',
  'the guarded direct write leaves the source unchanged'
);

select * from finish();
rollback;
