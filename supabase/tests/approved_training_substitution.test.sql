begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

select has_table('api', 'training_plan_item_alternatives', 'approved alternatives exist');
select has_table('api', 'training_session_run_item_substitutions', 'active substitutions exist');
select has_table('api', 'training_session_substitutions', 'canonical substitutions exist');
select has_column(
  'api', 'training_session_sets', 'planned_exercise_name',
  'performed sets preserve the planned exercise name'
);
select has_function(
  'api', 'substitute_training_exercise',
  array['uuid', 'uuid', 'uuid', 'text', 'timestamp with time zone', 'text'],
  'the substitution command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.substitute_training_exercise(uuid,uuid,uuid,text,timestamp with time zone,text)',
    'execute'
  ),
  'authenticated clients can request an approved substitution'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.substitute_training_exercise(uuid,uuid,uuid,text,timestamp with time zone,text)',
    'execute'
  ),
  'anonymous clients cannot substitute an exercise'
);
select ok(
  not has_table_privilege('authenticated', 'api.training_plan_item_alternatives', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_run_item_substitutions', 'insert')
    and not has_table_privilege('authenticated', 'api.training_session_substitutions', 'insert'),
  'clients cannot bypass substitution commands with direct writes'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_user_meta_data
) values
(
  '00000000-0000-0000-0000-000000000000',
  'd1000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'substitution-owner@example.invalid',
  '{
    "daygym_account_creation": "v1",
    "daygym_is_adult": true,
    "daygym_terms_version": "2026-08-13",
    "daygym_privacy_version": "2026-08-13"
  }'::jsonb
),
(
  '00000000-0000-0000-0000-000000000000',
  'd2000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'substitution-other@example.invalid',
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
  'd3000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000001',
  'Plano com alternativas', 'manual', 1, 1, 2
);
insert into api.training_plan_versions (
  version_id, plan_id, user_id, version_number, operation_id,
  author_user_id, change_summary, content_sha256, origin
) values (
  'd4000000-0000-4000-8000-000000000004',
  'd3000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000001',
  1, 'substitution-plan-version-0001',
  'd1000000-0000-4000-8000-000000000001',
  'Alternativas aprovadas', repeat('d', 64), 'manual'
);
insert into api.training_plan_sessions (
  session_id, version_id, user_id, day_order, name
) values (
  'd5000000-0000-4000-8000-000000000005',
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001', 1, 'Treino A'
);
insert into api.training_plan_items (
  item_id, session_id, version_id, user_id, item_order, exercise_name,
  modality, sets, reps_min, reps_max, planned_weight_kg, load_mode,
  load_increment_kg, set_progression_kg, duration_seconds, distance_meters,
  rest_seconds, circuit_group, notes
) values
(
  'd6000000-0000-4000-8000-000000000006',
  'd5000000-0000-4000-8000-000000000005',
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001',
  1, 'Agachamento livre', 'strength', 1, 8, 12, null, 'none', null, null,
  null, null, 60, null, null
),
(
  'd7000000-0000-4000-8000-000000000007',
  'd5000000-0000-4000-8000-000000000005',
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001',
  2, 'Supino reto', 'strength', 1, 8, 12, null, 'none', null, null,
  null, null, 60, null, null
);
insert into api.training_plan_item_alternatives (
  alternative_id, plan_item_id, version_id, user_id, alternative_order, exercise_name
) values
(
  'd8000000-0000-4000-8000-000000000008',
  'd6000000-0000-4000-8000-000000000006',
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001', 1, 'Leg press 45'
),
(
  'd9000000-0000-4000-8000-000000000009',
  'd7000000-0000-4000-8000-000000000007',
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001', 1, 'Supino máquina'
);
update api.training_plans
set active_version_id = 'd4000000-0000-4000-8000-000000000004'
where plan_id = 'd3000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

select is(
  (select was_created from api.start_training_session_at(
    'd5000000-0000-4000-8000-000000000005',
    'da000000-0000-4000-8000-00000000000a',
    'training-start:da000000-0000-4000-8000-00000000000a',
    statement_timestamp() - interval '2 minutes'
  )), true, 'the training run starts'
);
select throws_ok(
  $$select * from api.substitute_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd6000000-0000-4000-8000-000000000006',
    'db000000-0000-4000-8000-00000000000b',
    'preference', statement_timestamp(),
    'training-substitute:da000000:d6000000'
  )$$,
  '23514', 'Approved alternative was not found.',
  'an arbitrary alternative is rejected'
);
select is(
  (select exercise_name from api.substitute_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd6000000-0000-4000-8000-000000000006',
    'd8000000-0000-4000-8000-000000000008',
    'equipment_unavailable', statement_timestamp(),
    'training-substitute:da000000:d6000000'
  )), 'Leg press 45', 'an approved alternative becomes the executed exercise'
);
select is(
  (select planned_exercise_name from api.training_session_run_item_substitutions),
  'Agachamento livre', 'the active audit preserves the planned exercise'
);
select is(
  (select was_created from api.substitute_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd6000000-0000-4000-8000-000000000006',
    'd8000000-0000-4000-8000-000000000008',
    'equipment_unavailable', statement_timestamp(),
    'training-substitute:da000000:d6000000'
  )), false, 'replaying the same substitution is idempotent'
);

-- RLS-N29: another authenticated user cannot read active substitutions.
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from api.training_session_run_item_substitutions), 0::bigint,
  'RLS hides active substitutions from another user'
);
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

select is(
  (select was_created from api.start_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd6000000-0000-4000-8000-000000000006'
  )), true, 'the substituted exercise starts'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'da000000-0000-4000-8000-00000000000a',
    'd6000000-0000-4000-8000-000000000006', 1,
    'training-set:da000000:d6000000:1', 10, null, null, null
  )), true, 'the substituted exercise records its performed set'
);
select is(
  (select was_created from api.start_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd7000000-0000-4000-8000-000000000007'
  )), true, 'the next exercise starts'
);
select is(
  (select exercise_completed from api.complete_training_set(
    'da000000-0000-4000-8000-00000000000a',
    'd7000000-0000-4000-8000-000000000007', 1,
    'training-set:da000000:d7000000:1', 10, null, null, null
  )), true, 'the next exercise records its performed set'
);
select throws_ok(
  $$select * from api.substitute_training_exercise(
    'da000000-0000-4000-8000-00000000000a',
    'd7000000-0000-4000-8000-000000000007',
    'd9000000-0000-4000-8000-000000000009',
    'preference', statement_timestamp(),
    'training-substitute:da000000:d7000000'
  )$$,
  '23514', 'Exercise cannot be substituted.',
  'a completed exercise cannot be substituted retroactively'
);
select is(
  (select completion_status from api.finish_training_session_with_status_at(
    'da000000-0000-4000-8000-00000000000a',
    'da000000-0000-4000-8000-00000000000a',
    'training-finish:da000000-0000-4000-8000-00000000000a',
    'dc000000-0000-4000-8000-00000000000c',
    'dd000000-0000-4000-8000-00000000000d',
    statement_timestamp(), 'complete'
  )), 'complete', 'the training finishes with the substitution audit'
);
select is(
  (select executed_exercise_name from api.training_session_substitutions),
  'Leg press 45', 'the canonical audit preserves the executed alternative'
);
select is(
  (select exercise_name from api.training_session_sets
   where plan_item_id = 'd6000000-0000-4000-8000-000000000006'),
  'Leg press 45', 'history attributes performed volume to the executed exercise'
);
select is(
  (select planned_exercise_name from api.training_session_sets
   where plan_item_id = 'd6000000-0000-4000-8000-000000000006'),
  'Agachamento livre', 'history still exposes the original prescription'
);

select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
-- RLS-N30: another authenticated user cannot read canonical substitutions.
select is(
  (select count(*) from api.training_session_substitutions), 0::bigint,
  'RLS hides canonical substitutions from another user'
);
-- RLS-N28: another authenticated user cannot read approved alternatives.
select is(
  (select count(*) from api.training_plan_item_alternatives), 0::bigint,
  'RLS hides approved alternatives from another user'
);

select * from finish();
rollback;
