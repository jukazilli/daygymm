begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(31);

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

select has_table('api', 'training_plans', 'training plans exist');
select has_table('api', 'training_plan_versions', 'immutable plan versions exist');
select has_table('api', 'training_plan_sessions', 'plan sessions exist');
select has_table('api', 'training_plan_items', 'normalized plan items exist');
select has_function(
  'api',
  'import_official_xlsx_plan',
  array['text', 'text', 'text', 'integer', 'text', 'jsonb'],
  'the versioned official XLSX import command exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.import_official_xlsx_plan(text,text,text,integer,text,jsonb)',
    'execute'
  ),
  'anonymous clients cannot import plans'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.import_official_xlsx_plan(text,text,text,integer,text,jsonb)',
    'execute'
  ),
  'authenticated clients can execute the bounded import command'
);
select ok(
  not has_table_privilege('authenticated', 'api.training_plans', 'insert'),
  'clients cannot bypass the import command with direct writes'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class
   where oid in (
     'api.training_plans'::regclass,
     'api.training_plan_versions'::regclass,
     'api.training_plan_sessions'::regclass,
     'api.training_plan_items'::regclass
   )),
  'every exposed import relation enables and forces RLS'
);

select lives_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '75000000-0000-0000-0000-000000000005',
      'authenticated', 'authenticated', 'xlsx-owner-a@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the first eligible import owner exists'
);
select lives_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '76000000-0000-0000-0000-000000000006',
      'authenticated', 'authenticated', 'xlsx-owner-b@example.invalid',
      '{
        "daygym_account_creation": "v1",
        "daygym_is_adult": true,
        "daygym_terms_version": "2026-08-13",
        "daygym_privacy_version": "2026-08-13"
      }'::jsonb
    )$$,
  'the second eligible import owner exists'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000005', true);

select lives_ok(
  $$select api.save_onboarding_context(
      6::smallint, 'strength', 'intermediate', 3::smallint, 45::smallint,
      'full_gym', 'none', true
    )$$,
  'the first owner has a completed onboarding context'
);
select lives_ok(
  $$select api.select_plan_source('official_xlsx')$$,
  'the first owner selects the official XLSX path'
);
select lives_ok(
  $$select api.import_official_xlsx_plan(
      'xlsx-import:00000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      'treino-oficial.xlsx',
      4096,
      'Treino oficial',
      '[
        {
          "day_order": 1,
          "name": "Treino A",
          "items": [
            {
              "order": 1,
              "exercise_name": "Agachamento livre",
              "modality": "strength",
              "sets": 3,
              "reps_min": 8,
              "reps_max": 12,
              "duration_seconds": null,
              "distance_meters": null,
              "rest_seconds": 90,
              "circuit_group": null,
              "notes": null
            },
            {
              "order": 2,
              "exercise_name": "Prancha",
              "modality": "time",
              "sets": 3,
              "reps_min": null,
              "reps_max": null,
              "duration_seconds": 30,
              "distance_meters": null,
              "rest_seconds": 45,
              "circuit_group": null,
              "notes": "Manter postura"
            }
          ]
        },
        {
          "day_order": 2,
          "name": "Cardio",
          "items": [
            {
              "order": 1,
              "exercise_name": "Caminhada",
              "modality": "cardio",
              "sets": 1,
              "reps_min": null,
              "reps_max": null,
              "duration_seconds": 1200,
              "distance_meters": null,
              "rest_seconds": 0,
              "circuit_group": null,
              "notes": null
            }
          ]
        }
      ]'::jsonb
    )$$,
  'a valid normalized proposal is imported atomically'
);
select is((select count(*) from api.training_plans), 1::bigint, 'one plan is created');
select is((select count(*) from api.training_plan_versions), 1::bigint, 'one version is created');
select is((select count(*) from api.training_plan_sessions), 2::bigint, 'both sessions are created');
select is((select count(*) from api.training_plan_items), 3::bigint, 'all plan items are created');
select is(
  (select was_created from api.import_official_xlsx_plan(
    'xlsx-import:00000000-0000-4000-8000-000000000001', repeat('a', 64),
    'treino-oficial.xlsx', 4096, 'Treino oficial', '[]'::jsonb
  )),
  false,
  'replaying the same operation returns the existing plan'
);
select is((select count(*) from api.training_plans), 1::bigint, 'operation replay does not duplicate the plan');
select is(
  (select was_created from api.import_official_xlsx_plan(
    'xlsx-import:00000000-0000-4000-8000-000000000002', repeat('a', 64),
    'treino-oficial.xlsx', 4096, 'Treino oficial', '[]'::jsonb
  )),
  false,
  'the same file hash opens the existing plan'
);
select is((select count(*) from api.training_plan_versions), 1::bigint, 'file replay does not duplicate a version');

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000006', true);
select lives_ok(
  $$select api.save_onboarding_context(
      6::smallint, 'health_return', 'beginner', 2::smallint, 30::smallint,
      'bodyweight', 'none', true
    )$$,
  'the second owner has a completed onboarding context'
);
select lives_ok(
  $$select api.select_plan_source('manual')$$,
  'the second owner selects another path'
);
select ok(
  pg_temp.raises_sqlstate(
    $$select api.import_official_xlsx_plan(
      'xlsx-import:00000000-0000-4000-8000-000000000003', repeat('b', 64),
      'outro-treino.xlsx', 2048, 'Outro treino', '[]'::jsonb
    )$$,
    '23514'
  ),
  'a user outside the official XLSX path cannot import'
);
-- RLS-N14: a plan is visible only to its owner.
select is((select count(*) from api.training_plans), 0::bigint, 'RLS hides another owner plans');
-- RLS-N15: an imported plan version is visible only to its owner.
select is((select count(*) from api.training_plan_versions), 0::bigint, 'RLS hides another owner versions');
-- RLS-N16: imported plan sessions are visible only to their owner.
select is((select count(*) from api.training_plan_sessions), 0::bigint, 'RLS hides another owner plan sessions');
-- RLS-N17: imported plan items are visible only to their owner.
select is((select count(*) from api.training_plan_items), 0::bigint, 'RLS hides another owner plan items');

select set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000005', true);
select is((select count(*) from api.training_plans), 1::bigint, 'the first owner still reads the imported plan');
select ok(
  pg_temp.raises_sqlstate(
    $$select api.import_official_xlsx_plan(
      'xlsx-import:00000000-0000-4000-8000-000000000001', repeat('c', 64),
      'conflito.xlsx', 2048, 'Conflito', '[]'::jsonb
    )$$,
    '23505'
  ),
  'an operation key cannot be reused with different content'
);

select * from finish();
rollback;
