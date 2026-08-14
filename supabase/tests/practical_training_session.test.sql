begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(34);

select has_table('api', 'training_session_runs', 'active training runs exist');
select has_table(
  'api',
  'training_session_run_items',
  'active training exercise snapshots exist'
);
select has_function(
  'api',
  'start_training_session',
  array['uuid', 'uuid', 'text'],
  'authenticated start command exists'
);
select has_function(
  'api',
  'complete_training_exercise',
  array['uuid', 'uuid'],
  'authenticated exercise completion command exists'
);
select has_function(
  'api',
  'finish_training_session',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid'],
  'authenticated finish command exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.training_session_runs'::regclass),
  'active runs have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.training_session_runs'::regclass),
  'active runs force RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.training_session_run_items'::regclass),
  'run items have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.training_session_run_items'::regclass),
  'run items force RLS'
);
select ok(
  not has_table_privilege('authenticated', 'api.training_session_runs', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_runs', 'update')
    and not has_table_privilege('authenticated', 'api.training_session_runs', 'delete')
    and not has_table_privilege('authenticated', 'api.training_session_run_items', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_run_items', 'update')
    and not has_table_privilege('authenticated', 'api.training_session_run_items', 'delete'),
  'authenticated clients cannot mutate active training tables directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.start_training_session(uuid,uuid,text)',
    'execute'
  ),
  'anonymous clients cannot start a training session'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'practical-training-a@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'practical-training-b@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  );

insert into api.training_plans (
  plan_id,
  user_id,
  name,
  provenance,
  current_version,
  session_count,
  item_count
)
values (
  '83000000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000001',
  'Plano prático',
  'official_xlsx',
  1,
  1,
  2
);

insert into api.training_plan_versions (
  version_id,
  plan_id,
  user_id,
  version_number,
  operation_id,
  source_sha256,
  source_file_name,
  source_size_bytes
)
values (
  '84000000-0000-4000-8000-000000000004',
  '83000000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000001',
  1,
  'practical-plan-import-0001',
  repeat('a', 64),
  'practical-training.xlsx',
  1024
);

insert into api.training_plan_sessions (
  session_id,
  version_id,
  user_id,
  day_order,
  name
)
values (
  '85000000-0000-4000-8000-000000000005',
  '84000000-0000-4000-8000-000000000004',
  '81000000-0000-4000-8000-000000000001',
  1,
  'Treino A'
);

insert into api.training_plan_items (
  item_id,
  session_id,
  version_id,
  user_id,
  item_order,
  exercise_name,
  modality,
  sets,
  reps_min,
  reps_max,
  duration_seconds,
  distance_meters,
  rest_seconds,
  circuit_group,
  notes
)
values
  (
    '86000000-0000-4000-8000-000000000006',
    '85000000-0000-4000-8000-000000000005',
    '84000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000001',
    1,
    'Agachamento',
    'strength',
    3,
    8,
    12,
    null,
    null,
    90,
    null,
    null
  ),
  (
    '87000000-0000-4000-8000-000000000007',
    '85000000-0000-4000-8000-000000000005',
    '84000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000001',
    2,
    'Bicicleta',
    'cardio',
    1,
    null,
    null,
    1200,
    null,
    0,
    null,
    null
  );

update api.training_plans
set active_version_id = '84000000-0000-4000-8000-000000000004'
where plan_id = '83000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select was_created
    from api.start_training_session(
      '85000000-0000-4000-8000-000000000005',
      '88000000-0000-4000-8000-000000000008',
      'training-start:88000000-0000-4000-8000-000000000008'
    )
  ),
  true,
  'the first start creates an active run'
);
-- RLS-N18: an authenticated user cannot read another user's active run.
select is(
  (select count(*) from api.training_session_runs),
  1::bigint,
  'one active run is visible to its owner'
);
select is(
  (select count(*) from api.training_session_run_items),
  2::bigint,
  'the active run snapshots every planned exercise'
);
select is(
  (
    select was_created
    from api.start_training_session(
      '85000000-0000-4000-8000-000000000005',
      '89000000-0000-4000-8000-000000000009',
      'training-start:89000000-0000-4000-8000-000000000009'
    )
  ),
  false,
  'repeated start returns the current active run'
);
select is(
  (
    select run_id
    from api.start_training_session(
      '85000000-0000-4000-8000-000000000005',
      '89000000-0000-4000-8000-000000000009',
      'training-start:89000000-0000-4000-8000-000000000009'
    )
  ),
  '88000000-0000-4000-8000-000000000008'::uuid,
  'repeated start preserves the canonical active identity'
);

select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from api.training_session_runs),
  0::bigint,
  'another user cannot read the active run'
);
-- RLS-N19: an authenticated user cannot mutate another user's run items.
select throws_ok(
  $$select * from api.complete_training_exercise(
    '88000000-0000-4000-8000-000000000008',
    '86000000-0000-4000-8000-000000000006'
  )$$,
  '23514',
  'Exercise does not belong to the active training.',
  'another user cannot complete an exercise'
);

select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from api.training_session_runs),
  1::bigint,
  'the owner still sees the active run'
);
select is(
  (
    select was_created
    from api.complete_training_exercise(
      '88000000-0000-4000-8000-000000000008',
      '86000000-0000-4000-8000-000000000006'
    )
  ),
  true,
  'the first exercise completion is stored'
);
select is(
  (
    select completed_count
    from api.complete_training_exercise(
      '88000000-0000-4000-8000-000000000008',
      '86000000-0000-4000-8000-000000000006'
    )
  ),
  1,
  'the command reports current completion progress'
);
select is(
  (
    select was_created
    from api.complete_training_exercise(
      '88000000-0000-4000-8000-000000000008',
      '86000000-0000-4000-8000-000000000006'
    )
  ),
  false,
  'exercise completion replay is idempotent'
);
select throws_ok(
  $$select * from api.finish_training_session(
    '88000000-0000-4000-8000-000000000008',
    '88000000-0000-4000-8000-000000000008',
    'training-finish:88000000-0000-4000-8000-000000000008',
    '8a000000-0000-4000-8000-000000000010',
    '8b000000-0000-4000-8000-000000000011'
  )$$,
  '23514',
  'Complete every exercise before finishing the training.',
  'a run cannot finish while exercises remain'
);
select is(
  (
    select completed_count
    from api.complete_training_exercise(
      '88000000-0000-4000-8000-000000000008',
      '87000000-0000-4000-8000-000000000007'
    )
  ),
  2,
  'the last exercise completes the planned target'
);
select is(
  (
    select was_created
    from api.finish_training_session(
      '88000000-0000-4000-8000-000000000008',
      '88000000-0000-4000-8000-000000000008',
      'training-finish:88000000-0000-4000-8000-000000000008',
      '8a000000-0000-4000-8000-000000000010',
      '8b000000-0000-4000-8000-000000000011'
    )
  ),
  true,
  'finishing creates the canonical completed session'
);
select is(
  (select count(*) from api.training_session_runs),
  0::bigint,
  'finishing removes the active run'
);
select is(
  (
    select planned_session_id
    from api.training_sessions
    where session_id = '88000000-0000-4000-8000-000000000008'
  ),
  '85000000-0000-4000-8000-000000000005'::uuid,
  'the completion keeps its immutable planned session context'
);
select is(
  (
    select exercise_count
    from api.training_sessions
    where session_id = '88000000-0000-4000-8000-000000000008'
  ),
  2,
  'the canonical session records the completed exercise count'
);
select is(
  (
    select count(*)
    from platform.job_outbox
    where event_name = 'TrainingSessionCompleted'
      and event_envelope #>> '{payload,session_id}' =
        '88000000-0000-4000-8000-000000000008'
  ),
  1::bigint,
  'finishing emits one canonical domain event'
);
select is(
  (
    select was_created
    from api.finish_training_session(
      '88000000-0000-4000-8000-000000000008',
      '88000000-0000-4000-8000-000000000008',
      'training-finish:88000000-0000-4000-8000-000000000008',
      '8c000000-0000-4000-8000-000000000012',
      '8d000000-0000-4000-8000-000000000013'
    )
  ),
  false,
  'finish replay returns the canonical completion'
);
select is(
  (
    select count(*)
    from api.training_sessions
    where session_id = '88000000-0000-4000-8000-000000000008'
  ),
  1::bigint,
  'finish replay does not duplicate canonical state'
);
select is(
  (
    select count(*)
    from platform.job_outbox
    where event_name = 'TrainingSessionCompleted'
      and event_envelope #>> '{payload,session_id}' =
        '88000000-0000-4000-8000-000000000008'
  ),
  1::bigint,
  'finish replay does not duplicate the event'
);

select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from api.training_sessions),
  0::bigint,
  'another user cannot read the completed session'
);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from api.training_sessions),
  1::bigint,
  'the owner can read the completed session'
);

select * from finish();
rollback;
