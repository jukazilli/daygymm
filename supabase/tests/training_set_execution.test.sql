begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(103);

select has_table('api', 'training_session_run_sets', 'active performed sets exist');
select has_table('api', 'training_session_sets', 'canonical performed sets exist');
select has_table(
  'api', 'training_session_run_set_adjustments',
  'active set adjustment audit exists'
);
select has_table(
  'api', 'training_session_set_adjustments',
  'canonical set adjustment audit exists'
);
select has_column(
  'api', 'training_session_run_sets', 'revision',
  'active sets expose an optimistic-concurrency revision'
);
select has_column(
  'api', 'training_session_sets', 'revision',
  'canonical sets preserve their final revision'
);
select has_column(
  'api', 'training_session_run_items', 'set_progression_kg',
  'the active snapshot stores progression between sets'
);
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
  'get_previous_training_set_references',
  array['uuid'],
  'the authenticated previous-set reference query exists'
);
select has_function(
  'api',
  'revise_training_set',
  array[
    'uuid', 'uuid', 'uuid', 'integer', 'text', 'integer', 'text',
    'integer', 'numeric', 'integer', 'integer'
  ],
  'the authenticated set revision command exists'
);
select has_function(
  'api',
  'pause_training_session',
  array['uuid'],
  'the authenticated training pause command exists'
);
select has_function(
  'api',
  'resume_training_session',
  array['uuid'],
  'the authenticated training resume command exists'
);
select has_function(
  'api', 'start_training_session_at',
  array['uuid', 'uuid', 'text', 'timestamp with time zone'],
  'the replayable training start command exists'
);
select has_function(
  'api', 'pause_training_session_at',
  array['uuid', 'timestamp with time zone'],
  'the replayable training pause command exists'
);
select has_function(
  'api', 'resume_training_session_at',
  array['uuid', 'timestamp with time zone'],
  'the replayable training resume command exists'
);
select has_function(
  'api', 'cancel_training_session_once', array['uuid', 'text'],
  'the idempotent training cancellation command exists'
);
select has_function(
  'api', 'finish_training_session_at',
  array['uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamp with time zone'],
  'the replayable training finish command exists'
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
  (select relrowsecurity from pg_class
   where oid = 'api.training_session_run_set_adjustments'::regclass),
  'active set adjustments have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class
   where oid = 'api.training_session_run_set_adjustments'::regclass),
  'active set adjustments force RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'api.training_session_set_adjustments'::regclass),
  'canonical set adjustments have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class
   where oid = 'api.training_session_set_adjustments'::regclass),
  'canonical set adjustments force RLS'
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
  not has_table_privilege(
    'authenticated', 'api.training_session_run_set_adjustments', 'insert'
  )
    and not has_table_privilege(
      'authenticated', 'api.training_session_run_set_adjustments', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'api.training_session_run_set_adjustments', 'delete'
    )
    and not has_table_privilege(
      'authenticated', 'api.training_session_set_adjustments', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'api.training_session_set_adjustments', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'api.training_session_set_adjustments', 'delete'
    ),
  'authenticated clients cannot mutate set audit rows directly'
);
select ok(
  not has_function_privilege('anon', 'api.start_training_exercise(uuid,uuid)', 'execute'),
  'anonymous clients cannot start an exercise'
);
select ok(
  not has_function_privilege('anon', 'api.pause_training_session(uuid)', 'execute'),
  'anonymous clients cannot pause a training'
);
select ok(
  not has_function_privilege('anon', 'api.resume_training_session(uuid)', 'execute'),
  'anonymous clients cannot resume a training'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.start_training_session_at(uuid,uuid,text,timestamp with time zone)',
    'execute'
  ),
  'anonymous clients cannot replay a training start'
);
select ok(
  not has_function_privilege(
    'anon', 'api.pause_training_session_at(uuid,timestamp with time zone)', 'execute'
  ),
  'anonymous clients cannot replay a training pause'
);
select ok(
  not has_function_privilege(
    'anon', 'api.resume_training_session_at(uuid,timestamp with time zone)', 'execute'
  ),
  'anonymous clients cannot replay a training resume'
);
select ok(
  not has_function_privilege(
    'anon', 'api.cancel_training_session_once(uuid,text)', 'execute'
  ),
  'anonymous clients cannot replay a training cancellation'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.finish_training_session_at(uuid,uuid,text,uuid,uuid,timestamp with time zone)',
    'execute'
  ),
  'anonymous clients cannot replay a training finish'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.complete_training_set(uuid,uuid,integer,text,integer,numeric,integer,integer)',
    'execute'
  ),
  'anonymous clients cannot complete a set'
);
select ok(
  not has_function_privilege(
    'anon', 'api.get_previous_training_set_references(uuid)', 'execute'
  ),
  'anonymous clients cannot read previous-set references'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.revise_training_set(uuid,uuid,uuid,integer,text,integer,text,integer,numeric,integer,integer)',
    'execute'
  ),
  'anonymous clients cannot revise a performed set'
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bb000000-0000-4000-8000-000000000011',
    'authenticated', 'authenticated', 'set-import-owner@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  );

insert into api.onboarding_contexts (
  user_id, goal, experience, weekly_days, session_minutes,
  equipment_context, limitation_status, current_step, completed_at,
  plan_source, plan_source_selected_at
)
values (
  'bb000000-0000-4000-8000-000000000011', 'strength', 'intermediate', 3, 45,
  'full_gym', 'none', 6, statement_timestamp(),
  'official_xlsx', statement_timestamp()
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
  modality, sets, reps_min, reps_max, planned_weight_kg, load_mode,
  load_increment_kg, set_progression_kg,
  duration_seconds, distance_meters, rest_seconds, circuit_group, notes
)
values
  (
    'b6000000-0000-4000-8000-000000000006',
    'b5000000-0000-4000-8000-000000000005',
    'b4000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    1, 'Stiff', 'strength', 2, 10, 12, 40, 'external', 5, 2.5,
    null, null, 60, null, null
  ),
  (
    'b7000000-0000-4000-8000-000000000007',
    'b5000000-0000-4000-8000-000000000005',
    'b4000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    2, 'Prancha lateral', 'circuit', 2, null, null, null, 'none', null, null,
    30, null, 60, 'Circuito abdominal', null
  );

update api.training_plans
set active_version_id = 'b4000000-0000-4000-8000-000000000004'
where plan_id = 'b3000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb000000-0000-4000-8000-000000000011', true);
select is(
  (select was_created from api.import_official_xlsx_plan_v2(
    'set-import-with-weight-0001', repeat('c', 64), 'weighted-plan.xlsx',
    1024, 'Plano com carga', '[{
      "day_order": 1,
      "name": "Treino A",
      "items": [{
        "order": 1,
        "exercise_name": "Stiff",
        "modality": "strength",
        "sets": 3,
        "reps_min": 10,
        "reps_max": 12,
        "planned_weight_kg": 42.5,
        "duration_seconds": null,
        "distance_meters": null,
        "rest_seconds": 60,
        "circuit_group": null,
        "notes": null
      }]
    }]'::jsonb
  )),
  true,
  'the v2 command imports a proposal containing planned load'
);
select is(
  (select planned_weight_kg from api.training_plan_items),
  42.50::numeric,
  'the imported planned load is persisted without replacing repetitions'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is(
  (select was_created from api.start_training_session_at(
    'b5000000-0000-4000-8000-000000000005',
    'b8000000-0000-4000-8000-000000000008',
    'training-start:b8000000-0000-4000-8000-000000000008',
    statement_timestamp() - interval '2 minutes'
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
  (select set_progression_kg from api.training_session_run_items
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'),
  2.50::numeric,
  'the active snapshot keeps progression between sets'
);
select is(
  (select was_changed from api.pause_training_session_at(
    'b8000000-0000-4000-8000-000000000008',
    statement_timestamp() - interval '1 minute'
  )),
  true,
  'pausing changes an active run exactly once'
);
select ok(
  (select paused_at is not null from api.training_session_runs
   where run_id = 'b8000000-0000-4000-8000-000000000008'),
  'the active run stores its paused instant'
);
select throws_ok(
  $$select * from api.start_training_exercise(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006'
  )$$,
  '23514',
  'Resume the training before recording progress.',
  'a paused run rejects exercise progress'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from api.pause_training_session_at(
    'b8000000-0000-4000-8000-000000000008',
    statement_timestamp() - interval '1 minute'
  )$$,
  '23514',
  'Active training was not found.',
  'another user cannot pause the active run'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select is(
  (select was_changed from api.resume_training_session_at(
    'b8000000-0000-4000-8000-000000000008',
    statement_timestamp() - interval '50 seconds'
  )),
  true,
  'the owner can resume the paused run'
);
select ok(
  (select paused_at is null from api.training_session_runs
   where run_id = 'b8000000-0000-4000-8000-000000000008'),
  'resuming clears the paused instant'
);
select is(
  (select was_changed from api.resume_training_session_at(
    'b8000000-0000-4000-8000-000000000008',
    statement_timestamp() - interval '50 seconds'
  )),
  false,
  'repeated resume is idempotent'
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
  (select planned_weight_kg from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 1),
  40.00::numeric,
  'the first set keeps the configured initial load as its suggestion'
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
select set_config(
  'test.set_execution_id',
  (select set_execution_id::text
   from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 1),
  true
);
select is(
  (select revision from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.set_execution_id')::uuid,
    1, 'correct', 1, 'training-set-correct:b8:b6:1:r1',
    11, 41, null, null
  )),
  2,
  'a correction increments the optimistic-concurrency revision'
);
select is(
  (select actual_weight_kg from api.training_session_run_sets
   where set_execution_id = current_setting('test.set_execution_id')::uuid),
  41.00::numeric,
  'a correction replaces the performed value without changing the plan'
);
select is(
  (select was_changed from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.set_execution_id')::uuid,
    1, 'correct', 1, 'training-set-correct:b8:b6:1:r1',
    11, 41, null, null
  )),
  false,
  'replaying a correction is idempotent'
);
select is(
  (select count(*) from api.training_session_run_set_adjustments
   where set_execution_id = current_setting('test.set_execution_id')::uuid),
  1::bigint,
  'a correction creates one active audit row'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
-- RLS-N26: another authenticated user cannot read active set adjustments.
select is(
  (select count(*) from api.training_session_run_set_adjustments),
  0::bigint,
  'another user cannot read active set adjustments'
);
select throws_ok(
  $$select * from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.set_execution_id')::uuid,
    1, 'undo', 2, 'training-set-undo:b8:b6:1:r2',
    null, null, null, null
  )$$,
  '23514',
  'Active training was not found.',
  'another user cannot revise an active set'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select is(
  (select completed_set_count from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.set_execution_id')::uuid,
    1, 'undo', 2, 'training-set-undo:b8:b6:1:r2',
    null, null, null, null
  )),
  0,
  'undo removes the latest completed set and restores its pending position'
);
select is(
  (select was_changed from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.set_execution_id')::uuid,
    1, 'undo', 2, 'training-set-undo:b8:b6:1:r2',
    null, null, null, null
  )),
  false,
  'replaying an undo is idempotent even after the set row is gone'
);
select is(
  (select count(*) from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'),
  0::bigint,
  'undo leaves no hidden performed set behind'
);
select is(
  (select was_created from api.complete_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    1, 'training-set:b8:b6:1', 10, 40, null, null
  )),
  true,
  'the undone set can be performed again from the beginning'
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
select is(
  (select planned_weight_kg from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  42.50::numeric,
  'the next set stores the progressed suggestion independently from actual load'
);
select set_config(
  'test.second_set_execution_id',
  (select set_execution_id::text
   from api.training_session_run_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  true
);
select is(
  (select exercise_completed from api.revise_training_set(
    'b8000000-0000-4000-8000-000000000008',
    'b6000000-0000-4000-8000-000000000006',
    current_setting('test.second_set_execution_id')::uuid,
    2, 'correct', 1, 'training-set-correct:b8:b6:2:r1',
    12, 38, null, null
  )),
  true,
  'correcting a final set preserves the completed exercise state'
);
select is(
  (select actual_weight_kg from api.training_session_run_sets
   where set_execution_id = current_setting('test.second_set_execution_id')::uuid),
  38.00::numeric,
  'the final set exposes its corrected performed load immediately'
);
select is(
  (select revision from api.training_session_run_sets
   where set_execution_id = current_setting('test.second_set_execution_id')::uuid),
  2,
  'the effective final-set correction is versioned'
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

-- Anchor elapsed time immediately before finishing. Keeping this setup beside
-- the assertion prevents the duration check from depending on how long the
-- preceding remote pgTAP statements take to execute.
reset role;
update api.training_session_runs
set started_at = statement_timestamp() - interval '120 seconds',
  paused_duration_seconds = 60
where run_id = 'b8000000-0000-4000-8000-000000000008';
set local role authenticated;

select is(
  (select was_created from api.finish_training_session_at(
    'b8000000-0000-4000-8000-000000000008',
    'b8000000-0000-4000-8000-000000000008',
    'training-finish:b8000000-0000-4000-8000-000000000008',
    'b9000000-0000-4000-8000-000000000009',
    'ba000000-0000-4000-8000-000000000010',
    statement_timestamp()
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
  38.00::numeric,
  'canonical history preserves actual weight separately from planned weight'
);
select is(
  (select revision from api.training_session_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  2,
  'canonical history preserves the final set revision'
);
select is(
  (select count(*) from api.training_session_set_adjustments
   where set_execution_id = current_setting('test.second_set_execution_id')::uuid),
  1::bigint,
  'the finished session preserves the surviving correction audit'
);
select is(
  (select count(*) from api.training_session_run_set_adjustments),
  0::bigint,
  'active correction and undo audit is cleaned up with the finished run'
);
select is(
  (select planned_weight_kg from api.training_session_sets
   where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
     and set_number = 2),
  42.50::numeric,
  'canonical history preserves the progressed suggestion for the set'
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
select ok(
  (select duration_seconds between 59 and 65 from api.training_sessions
   where session_id = 'b8000000-0000-4000-8000-000000000008'),
  'final duration excludes accumulated paused time'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
-- RLS-N24: another authenticated user cannot read canonical performed sets.
select is(
  (select count(*) from api.training_session_sets),
  0::bigint,
  'another user cannot read canonical performed sets'
);
-- RLS-N27: another authenticated user cannot read canonical set adjustments.
select is(
  (select count(*) from api.training_session_set_adjustments),
  0::bigint,
  'another user cannot read canonical set adjustments'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select is(
  (select was_created from api.start_training_session(
    'b5000000-0000-4000-8000-000000000005',
    'bc000000-0000-4000-8000-000000000012',
    'training-start:bc000000-0000-4000-8000-000000000012'
  )),
  true,
  'a later run can start from the same planned session'
);
select is(
  (select count(*) from api.get_previous_training_set_references(
    'bc000000-0000-4000-8000-000000000012'
  )),
  4::bigint,
  'the later run receives one comparable reference per planned set'
);
select is(
  (select actual_weight_kg from api.get_previous_training_set_references(
    'bc000000-0000-4000-8000-000000000012'
  ) where plan_item_id = 'b6000000-0000-4000-8000-000000000006'
      and set_number = 2),
  38.00::numeric,
  'the reference uses the latest corrected performed value'
);

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from api.get_previous_training_set_references(
    'bc000000-0000-4000-8000-000000000012'
  )$$,
  '23514',
  'Active training was not found.',
  'another user cannot inspect references for the active run'
);

select * from finish();
rollback;
