begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(40);

select has_table('api', 'training_session_run_sets', 'active performed sets exist');
select has_table('api', 'training_session_sets', 'canonical performed sets exist');
select has_function(
  'api',
  'start_training_exercise',
  array['uuid', 'uuid'],
  'the authenticated exercise start command exists'
);
select has_function(
  'api',
  'complete_training_set',
  array['uuid', 'uuid', 'integer', 'text', 'integer', 'numeric', 'integer', 'integer'],
  'the authenticated set completion command exists'
);
select has_function(
  'api',
  'import_official_xlsx_plan_v2',
  array['text', 'text', 'text', 'integer', 'text', 'jsonb'],
  'the plan import command accepts optional planned load'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.training_session_run_sets'::regclass),
  'active set rows have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.training_session_run_sets'::regclass),
  'active set rows force RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.training_session_sets'::regclass),
  'canonical set rows have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.training_session_sets'::regclass),
  'canonical set rows force RLS'
);
select ok(
  not has_table_privilege('authenticated', 'api.training_session_run_sets', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_run_sets', 'update')
    and not has_table_privilege('authenticated', 'api.training_session_run_sets', 'delete')
    and not has_table_privilege('authenticated', 'api.training_session_sets', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_sets', 'update')
    and not has_table_privilege('authenticated', 'api.training_session_sets', 'delete'),
  'authenticated clients cannot mutate performed sets directly'
);
select ok(
  not has_function_privilege('anon', 'api.start_training_exercise(uuid,uuid)', 'execute'),
  'anonymous clients cannot start an exercise'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.complete_training_set(uuid,uuid,integer,text,integer,numeric,integer,integer)',
    'execute'
  ),
  'anonymous clients cannot complete a set'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'b1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'set-owner-a@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'set-owner-b@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  );

insert into api.training_plans (
  plan_id, user_id, name, provenance, current_version, session_count, item_count
)
values (
  'b3000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000001',
  'Plano por séries', 'official_xlsx', 1, 1, 2
);

insert into api.training_plan_versions (
  version_id, plan_id, user_id, version_number, operation_id,
  source_sha256, source_file_name, source_size_bytes
)
values (
  'b4000000-0000-4000-8000-000000000004',
  'b3000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000001',
  1, 'set-plan-import-0001', repeat('b', 64), 'set-training.xlsx', 1024
);

insert into api.training_plan_sessions (
  session_id, version_id, user_id, day_order, name
)
values (
  'b5000000-0000-4000-8000-000000000005',
  'b4000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000001',
  1, 'Treino por séries'
);

insert into api.training_plan_items (
  item_id, session_id, version_id, user_id, item_order, exercise_name,
  modality, sets, reps_min, reps_max, planned_weight_kg,
  duration_seconds, distance_meters, rest_seconds, circuit_group, notes
)
values
  (
    'b6000000-0000-4000-8000-000000000006',
    'b5000000-0000-4000-8000-000000000005',
    'b4000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    1, 'Stiff', 'strength', 2, 10, 12, 40, null, null, 60, null, null
  ),
  (
    'b7000000-0000-4000-8000-000000000007',
    'b5000000-0000-4000-8000-000000000005',
    'b4000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    2, 'Prancha lateral', 'circuit', 2, null, null, null, 30, null, 60,
    'Circuito abdominal', null
  );

update api.training_plans
set active_version_id = 'b4000000-0000-4000-8000-000000000004'
where plan_id = 'b3000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is(
  (select was_created from api.start_training_session(
    'b5000000-0000-4000-8000-000000000005',
    'b8000000-0000-4000-8000-000000000008',
    'training-start:b8000000-0000-4000-8000-000000000008'
  )),
  true,
  'starting the session creates its active snapshot'
);
select is(
  (select planned_weight_kg from api.training_session_run_items
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'),
  40.00::numeric,
  'the active snapshot keeps the planned weight'
);
select is(
  (select was_created from api.start_training_exercise(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006'
  )),
  true,
  'Play persists the first exercise start'
);
select is(
  (select next_set_number from api.start_training_exercise(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006'
  )),
  1,
  'repeated Play resumes at the first pending set'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
-- RLS-N23: another authenticated user cannot read active performed sets.
select is(
  (select count(*) from api.training_session_run_sets),
  0::bigint,
  'another user cannot read active performed sets'
);
select throws_ok(
  $$select * from api.start_training_exercise(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006'
  )$$,
  '23514',
  'Exercise does not belong to the active training.',
  'another user cannot start the exercise'
);
select throws_ok(
  $$select * from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 12, 40, null, null
  )$$,
  '23514',
  'Exercise does not belong to the active training.',
  'another user cannot complete the set'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:precision', 12, 40.123, null, null
  )$$,
  '22023',
  'Set completion command is invalid.',
  'actual load cannot be rounded silently'
);
select is(
  (select was_created from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 10, 40, null, null
  )),
  true,
  'the first set is persisted immediately'
);
select is(
  (select completed_set_count from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 10, 40, null, null
  )),
  1,
  'the command reports one completed set'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 10, 40, null, null
  )),
  false,
  'the exercise remains active before its last set'
);
select is(
  (select was_created from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 10, 40, null, null
  )),
  false,
  'replaying the same set command is idempotent'
);
select is(
  (select count(*) from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'),
  1::bigint,
  'set replay does not duplicate active state'
);
select throws_ok(
  $$select * from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 12, 40, null, null
  )$$,
  '23505',
  'Set operation identifier was reused with different content.',
  'a replay cannot silently change performed values'
);
select throws_ok(
  $$select * from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    3, 'training-set:b8:b6:3', 12, 40, null, null
  )$$,
  '23514',
  'Complete the next pending set.',
  'sets cannot be skipped'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    2, 'training-set:b8:b6:2', 12, 37.5, null, null
  )),
  true,
  'the last set automatically completes the exercise'
);
select ok(
  (select completed_at is not null from api.training_session_run_items
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'),
  'the exercise snapshot is marked complete'
);
select is(
  (select was_created from api.start_training_exercise(
    'b8000000-0000-4000-8000-000000000008',
    'b7000000-0000-4000-8000-000000000007'
  )),
  true,
  'the time-based circuit can start without repetitions'
);
select is(
  (select completed_set_count from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b7000000-0000-4000-8000-000000000007',
    1, 'training-set:b8:b7:1', null, null, 30, null
  )),
  1,
  'a time set persists duration without repetitions'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b7000000-0000-4000-8000-000000000007',
    2, 'training-set:b8:b7:2', null, null, 25, null
  )),
  true,
  'the final time set automatically completes its exercise'
);
select is(
  (select was_created from api.finish_training_session(
    'b8000000-0000-4000-8000-000000000008',
    'b8000000-0000-4000-8000-000000000008',
    'training-finish:b8000000-0000-4000-8000-000000000008',
    'b9000000-0000-4000-8000-000000000009',
    'ba000000-0000-4000-8000-000000000010'
  )),
  true,
  'finishing persists the canonical session'
);
select is(
  (select count(*) from api.training_session_sets
   where session_id = 'b8000000-0000-4000-8000-000000000008'),
  4::bigint,
  'all performed sets survive active-run cleanup'
);
select is(
  (select actual_reps from api.training_session_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  12,
  'canonical history preserves actual repetitions'
);
select is(
  (select actual_weight_kg from api.training_session_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  37.50::numeric,
  'canonical history preserves actual weight separately from planned weight'
);
select is(
  (select actual_duration_seconds from api.training_session_sets
   where plan_item_id = 'b7000000-0000-4000-8000-000000000007'
     and set_number = 2),
  25,
  'canonical history preserves actual duration'
);
select is(
  (select count(*) from api.training_session_run_sets),
  0::bigint,
  'finishing removes active performed sets with the run'
);
select is(
  (select count(*) from api.training_session_sets),
  4::bigint,
  'the owner can read canonical performed sets'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
-- RLS-N24: another authenticated user cannot read canonical performed sets.
select is(
  (select count(*) from api.training_session_sets),
  0::bigint,
  'another user cannot read canonical performed sets'
);

select * from finish();
rollback;
