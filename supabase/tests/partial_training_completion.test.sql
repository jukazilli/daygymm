begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

select has_column(
  'api', 'training_sessions', 'completion_status',
  'canonical sessions expose an explicit completion outcome'
);
select has_column(
  'api', 'training_sessions', 'completed_set_count',
  'canonical sessions expose confirmed set count'
);
select has_column(
  'api', 'training_sessions', 'planned_set_count',
  'canonical sessions expose planned set count'
);
select has_function(
  'api', 'finish_training_session_with_status_at',
  array[
    'uuid', 'uuid', 'text', 'uuid', 'uuid',
    'timestamp with time zone', 'text'
  ],
  'the explicit complete-or-partial finish command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.finish_training_session_with_status_at(uuid,uuid,text,uuid,uuid,timestamp with time zone,text)',
    'execute'
  ),
  'authenticated clients can finish with an explicit outcome'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.finish_training_session_with_status_at(uuid,uuid,text,uuid,uuid,timestamp with time zone,text)',
    'execute'
  ),
  'anonymous clients cannot finish a training'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  'c1000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'partial-owner@example.invalid',
  '{
    "daygym_account_creation": "v1",
    "daygym_is_adult": true,
    "daygym_terms_version": "2026-08-13",
    "daygym_privacy_version": "2026-08-13"
  }'::jsonb
);

insert into api.training_plans (
  plan_id, user_id, name, provenance, current_version, session_count, item_count
) values (
  'c2000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'Plano parcial', 'official_xlsx', 1, 1, 1
);
insert into api.training_plan_versions (
  version_id, plan_id, user_id, version_number, operation_id,
  source_sha256, source_file_name, source_size_bytes
) values (
  'c3000000-0000-4000-8000-000000000003',
  'c2000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  1, 'partial-plan-import-0001', repeat('c', 64), 'partial.xlsx', 1024
);
insert into api.training_plan_sessions (
  session_id, version_id, user_id, day_order, name
) values (
  'c4000000-0000-4000-8000-000000000004',
  'c3000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001', 1, 'Treino parcial'
);
insert into api.training_plan_items (
  item_id, session_id, version_id, user_id, item_order, exercise_name,
  modality, sets, reps_min, reps_max, planned_weight_kg, load_mode,
  load_increment_kg, set_progression_kg, duration_seconds, distance_meters,
  rest_seconds, circuit_group, notes
) values (
  'c5000000-0000-4000-8000-000000000005',
  'c4000000-0000-4000-8000-000000000004',
  'c3000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  1, 'Agachamento', 'strength', 2, 8, 12, 40, 'external', 5, null,
  null, null, 60, null, null
);
update api.training_plans
set active_version_id = 'c3000000-0000-4000-8000-000000000003'
where plan_id = 'c2000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true
);
select set_config('test.partial_completed_at', statement_timestamp()::text, true);

select throws_ok(
  $$select * from api.finish_training_session_with_status_at(
    'c6000000-0000-4000-8000-000000000006',
    'c6000000-0000-4000-8000-000000000006',
    'training-finish-partial:c6000000-0000-4000-8000-000000000006',
    'c7000000-0000-4000-8000-000000000007',
    'c8000000-0000-4000-8000-000000000008',
    current_setting('test.partial_completed_at')::timestamptz, 'partial'
  )$$,
  '23514', 'Active training was not found.',
  'partial completion rejects a missing active run'
);
select is(
  (select was_created from api.start_training_session_at(
    'c4000000-0000-4000-8000-000000000004',
    'c6000000-0000-4000-8000-000000000006',
    'training-start:c6000000-0000-4000-8000-000000000006',
    statement_timestamp() - interval '2 minutes'
  )), true, 'a partial-test run starts'
);
select throws_ok(
  $$select * from api.finish_training_session_with_status_at(
    'c6000000-0000-4000-8000-000000000006',
    'c6000000-0000-4000-8000-000000000006',
    'training-finish-partial:c6000000-0000-4000-8000-000000000006',
    'c7000000-0000-4000-8000-000000000007',
    'c8000000-0000-4000-8000-000000000008',
    current_setting('test.partial_completed_at')::timestamptz, 'partial'
  )$$,
  '23514', 'Partial completion requires confirmed and pending sets.',
  'a partial finish cannot invent progress when no set was confirmed'
);
select is(
  (select was_created from api.start_training_exercise(
    'c6000000-0000-4000-8000-000000000006',
    'c5000000-0000-4000-8000-000000000005'
  )), true, 'the exercise starts'
);
select is(
  (select completed_set_count from api.complete_training_set(
    'c6000000-0000-4000-8000-000000000006',
    'c5000000-0000-4000-8000-000000000005',
    1, 'training-set:c6:c5:1', 10, 40, null, null
  )), 1, 'one real set is confirmed'
);
select is(
  (select completion_status from api.finish_training_session_with_status_at(
    'c6000000-0000-4000-8000-000000000006',
    'c6000000-0000-4000-8000-000000000006',
    'training-finish-partial:c6000000-0000-4000-8000-000000000006',
    'c7000000-0000-4000-8000-000000000007',
    'c8000000-0000-4000-8000-000000000008',
    current_setting('test.partial_completed_at')::timestamptz, 'partial'
  )), 'partial', 'the command returns an explicit partial outcome'
);
select is(
  (select completion_status from api.training_sessions
   where session_id = 'c6000000-0000-4000-8000-000000000006'),
  'partial', 'canonical history keeps the partial outcome'
);
select is(
  (select completed_set_count from api.training_sessions
   where session_id = 'c6000000-0000-4000-8000-000000000006'),
  1, 'canonical history counts only confirmed sets'
);
select is(
  (select planned_set_count from api.training_sessions
   where session_id = 'c6000000-0000-4000-8000-000000000006'),
  2, 'canonical history preserves the planned set count'
);
select is(
  (select count(*) from api.training_session_sets
   where session_id = 'c6000000-0000-4000-8000-000000000006'),
  1::bigint, 'only the performed set enters canonical history'
);
select is(
  (select count(*) from api.training_session_runs
   where run_id = 'c6000000-0000-4000-8000-000000000006'),
  0::bigint, 'the partial run is closed'
);
reset role;
select is(
  (select event_name from platform.job_outbox
   where event_id = 'c7000000-0000-4000-8000-000000000007'),
  'TrainingSessionPartiallyCompleted',
  'partial completion emits no complete-only event'
);
set local role authenticated;
select is(
  (select was_created from api.finish_training_session_with_status_at(
    'c6000000-0000-4000-8000-000000000006',
    'c6000000-0000-4000-8000-000000000006',
    'training-finish-partial:c6000000-0000-4000-8000-000000000006',
    'c7000000-0000-4000-8000-000000000007',
    'c8000000-0000-4000-8000-000000000008',
    current_setting('test.partial_completed_at')::timestamptz, 'partial'
  )), false, 'an exact partial replay is idempotent'
);

select is(
  (select was_created from api.start_training_session_at(
    'c4000000-0000-4000-8000-000000000004',
    'c9000000-0000-4000-8000-000000000009',
    'training-start:c9000000-0000-4000-8000-000000000009',
    statement_timestamp() - interval '2 minutes'
  )), true, 'a new full run starts after a partial one'
);
select is(
  (select was_created from api.start_training_exercise(
    'c9000000-0000-4000-8000-000000000009',
    'c5000000-0000-4000-8000-000000000005'
  )), true, 'the full-run exercise starts'
);
select is(
  (select completed_set_count from api.complete_training_set(
    'c9000000-0000-4000-8000-000000000009',
    'c5000000-0000-4000-8000-000000000005',
    1, 'training-set:c9:c5:1', 10, 40, null, null
  )), 1, 'the full run records its first set'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'c9000000-0000-4000-8000-000000000009',
    'c5000000-0000-4000-8000-000000000005',
    2, 'training-set:c9:c5:2', 11, 42, null, null
  )), true, 'the full run records every planned set'
);
select is(
  (select completion_status from api.finish_training_session_with_status_at(
    'c9000000-0000-4000-8000-000000000009',
    'c9000000-0000-4000-8000-000000000009',
    'training-finish:c9000000-0000-4000-8000-000000000009',
    'ca000000-0000-4000-8000-000000000010',
    'cb000000-0000-4000-8000-000000000011',
    statement_timestamp(), 'complete'
  )), 'complete', 'the existing complete path remains explicit'
);
select is(
  (select format('(%s,%s)', completed_set_count, planned_set_count)
   from api.training_sessions
   where session_id = 'c9000000-0000-4000-8000-000000000009'),
  '(2,2)', 'a complete finish confirms every planned set'
);
reset role;
select is(
  (select event_name from platform.job_outbox
   where event_id = 'ca000000-0000-4000-8000-000000000010'),
  'TrainingSessionCompleted',
  'a complete finish preserves its established event semantics'
);

select * from finish();
rollback;
