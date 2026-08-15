begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(37);

select has_table('api', 'training_plans', 'training plans exist');
select has_column('api', 'training_plans', 'archived_at', 'plans can be archived');
select has_column('api', 'training_plan_versions', 'author_user_id', 'versions record their author');
select has_column('api', 'training_plan_versions', 'change_summary', 'versions explain their change');
select has_column('api', 'training_plan_items', 'load_mode', 'strength items classify load usage');
select has_column('api', 'training_plan_items', 'load_increment_kg', 'strength items store the equipment step');
select has_function(
  'api',
  'publish_training_plan_version',
  array['uuid', 'text', 'text', 'text', 'text', 'jsonb'],
  'the bounded version publication command exists'
);
select has_function('api', 'archive_training_plan', array['uuid'], 'the archive command exists');
select has_function('api', 'restore_training_plan', array['uuid'], 'the restore command exists');
select ok(
  has_function_privilege(
    'authenticated',
    'api.publish_training_plan_version(uuid,text,text,text,text,jsonb)',
    'execute'
  ),
  'authenticated users can publish a bounded plan version'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.publish_training_plan_version(uuid,text,text,text,text,jsonb)',
    'execute'
  ),
  'anonymous users cannot publish a plan version'
);
select ok(
  not has_table_privilege('authenticated', 'api.training_plans', 'insert')
    and not has_table_privilege('authenticated', 'api.training_plans', 'update')
    and not has_table_privilege('authenticated', 'api.training_plan_versions', 'insert')
    and not has_table_privilege('authenticated', 'api.training_plan_items', 'insert'),
  'clients cannot bypass plan commands with direct writes'
);

select lives_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'c1000000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated', 'plan-author-a@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the plan owner exists'
);
select lives_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'c2000000-0000-4000-8000-000000000002',
      'authenticated', 'authenticated', 'plan-author-b@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'another authenticated user exists'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select api.save_onboarding_context(
      6::smallint, 'strength', 'intermediate', 3::smallint, 45::smallint,
      'full_gym', 'none', true
    )$$,
  'the owner completes onboarding'
);
select lives_ok(
  $$select api.select_plan_source('manual')$$,
  'the owner selects manual plan creation'
);
select lives_ok(
  $$create temporary table pg_temp.first_publication as
    select * from api.publish_training_plan_version(
      null,
      'plan-publish:c3000000-0000-4000-8000-000000000003',
      repeat('a', 64),
      'Meu plano',
      'Criei o plano',
      '[{
        "day_order": 1,
        "name": "Treino A",
        "items": [
          {
            "order": 1,
            "exercise_name": "Supino reto",
            "modality": "strength",
            "sets": 3,
            "reps_min": 8,
            "reps_max": 12,
            "planned_weight_kg": 40,
            "load_mode": "external",
            "load_increment_kg": 2.5,
            "duration_seconds": null,
            "distance_meters": null,
            "rest_seconds": 90,
            "circuit_group": null,
            "notes": null
          },
          {
            "order": 2,
            "exercise_name": "Esteira",
            "modality": "cardio",
            "sets": 1,
            "reps_min": null,
            "reps_max": null,
            "planned_weight_kg": null,
            "load_mode": "none",
            "load_increment_kg": null,
            "duration_seconds": 1200,
            "distance_meters": null,
            "rest_seconds": 0,
            "circuit_group": null,
            "notes": null
          }
        ]
      }]'::jsonb
    )$$,
  'the first manual plan version is published atomically'
);
select is((select count(*) from api.training_plans), 1::bigint, 'one active plan is visible');
select is(
  (
    select author_user_id::text || ':' || change_summary || ':' || origin
    from api.training_plan_versions
  ),
  'c1000000-0000-4000-8000-000000000001:Criei o plano:manual',
  'the immutable version records author, summary, and origin'
);
select is(
  (
    select planned_weight_kg::text || ':' || load_increment_kg::text
    from api.training_plan_items
    where exercise_name = 'Supino reto'
  ),
  '40.00:2.50',
  'the strength item stores initial load and equipment step'
);
select is(
  (select load_mode from api.training_plan_items where exercise_name = 'Esteira'),
  'none',
  'cardio explicitly remains outside load progression'
);
select is(
  (select count(*) from api.training_plan_schedule_entries),
  1::bigint,
  'the authored session receives an explicit weekly schedule entry'
);

select lives_ok(
  $$create temporary table pg_temp.second_publication as
    select * from api.publish_training_plan_version(
      (select plan_id from pg_temp.first_publication),
      'plan-publish:c4000000-0000-4000-8000-000000000004',
      repeat('b', 64),
      'Meu plano atualizado',
      'Troquei o exercício principal',
      '[{
        "day_order": 8,
        "name": "Treino A revisado",
        "items": [{
          "order": 1,
          "exercise_name": "Supino inclinado",
          "modality": "strength",
          "sets": 4,
          "reps_min": 8,
          "reps_max": 10,
          "planned_weight_kg": null,
          "load_mode": "unconfigured",
          "load_increment_kg": null,
          "duration_seconds": null,
          "distance_meters": null,
          "rest_seconds": 90,
          "circuit_group": null,
          "notes": null
        }]
      }]'::jsonb
    )$$,
  'editing content publishes a second immutable version'
);
select is(
  (select current_version from api.training_plans),
  2,
  'the plan points to version two'
);
select is(
  (
    select count(*)
    from api.training_plan_items as item
    join api.training_plan_versions as version using (version_id)
    where version.version_number = 1 and item.exercise_name = 'Supino reto'
  ),
  1::bigint,
  'version one keeps its original exercise snapshot'
);
select throws_ok(
  $$select * from api.publish_training_plan_version(
      (select plan_id from pg_temp.first_publication),
      'plan-publish:c5000000-0000-4000-8000-000000000005',
      repeat('c', 64), 'Inválido', 'Carga indevida',
      '[{
        "day_order": 1,
        "name": "Cardio",
        "items": [{
          "order": 1,
          "exercise_name": "Corrida",
          "modality": "cardio",
          "sets": 1,
          "reps_min": null,
          "reps_max": null,
          "planned_weight_kg": 20,
          "load_mode": "external",
          "load_increment_kg": 2,
          "duration_seconds": 900,
          "distance_meters": null,
          "rest_seconds": 0,
          "circuit_group": null,
          "notes": null
        }]
      }]'::jsonb
    )$$,
  '22023',
  'Plan item is invalid.',
  'non-strength exercises reject load configuration'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
-- RLS-N25: another authenticated user cannot read or version the owner plan.
select is((select count(*) from api.training_plans), 0::bigint, 'RLS hides another user plan');
select is(
  (select count(*) from api.training_plan_versions),
  0::bigint,
  'RLS hides another user plan versions'
);
select throws_ok(
  $$select * from api.publish_training_plan_version(
      (select plan_id from pg_temp.first_publication),
      'plan-publish:c6000000-0000-4000-8000-000000000006',
      repeat('d', 64), 'Ataque', 'Tentativa indevida',
      '[{
        "day_order": 1,
        "name": "Treino indevido",
        "items": [{
          "order": 1,
          "exercise_name": "Supino",
          "modality": "strength",
          "sets": 3,
          "reps_min": 8,
          "reps_max": 12,
          "planned_weight_kg": null,
          "load_mode": "unconfigured",
          "load_increment_kg": null,
          "duration_seconds": null,
          "distance_meters": null,
          "rest_seconds": 90,
          "circuit_group": null,
          "notes": null
        }]
      }]'::jsonb
    )$$,
  '23514',
  'Active plan was not found.',
  'another user cannot publish a version for the owner plan'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select * from api.start_training_session(
      (
        select session_id from api.training_plan_sessions
        where version_id = (select version_id from pg_temp.second_publication)
      ),
      'c7000000-0000-4000-8000-000000000007',
      'training-start:c7000000-0000-4000-8000-000000000007'
    )$$,
  'the current version can start a training run'
);
select throws_ok(
  $$select * from api.archive_training_plan(
      (select plan_id from pg_temp.first_publication)
    )$$,
  '23514',
  'Finish or cancel the active training before archiving the plan.',
  'an active run blocks plan archival'
);
select lives_ok(
  $$select * from api.cancel_training_session(
      'c7000000-0000-4000-8000-000000000007'
    )$$,
  'the owner cancels the active run'
);
select lives_ok(
  $$select * from api.archive_training_plan(
      (select plan_id from pg_temp.first_publication)
    )$$,
  'the plan can be archived after the run ends'
);
select ok(
  (select archived_at is not null from api.training_plans),
  'the archived plan is removed from future active-plan queries'
);
select is(
  (select count(*) from api.training_plan_versions),
  2::bigint,
  'archiving preserves every immutable version'
);
select lives_ok(
  $$select * from api.restore_training_plan(
      (select plan_id from pg_temp.first_publication)
    )$$,
  'the owner can undo plan archival'
);
select ok(
  (select archived_at is null from api.training_plans),
  'restoring makes the plan active again'
);

select * from finish();
rollback;
