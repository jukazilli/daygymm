begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

select has_table(
  'api',
  'training_plan_schedule_entries',
  'the explicit weekly schedule exists'
);
select has_function(
  'api',
  'rename_training_plan',
  array['uuid', 'text'],
  'the authenticated plan rename command exists'
);
select has_function(
  'api',
  'cancel_training_session',
  array['uuid'],
  'the authenticated cancellation command exists'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'api.training_plan_schedule_entries'::regclass),
  'weekly schedule entries have RLS enabled'
);
select ok(
  (select relforcerowsecurity
   from pg_class
   where oid = 'api.training_plan_schedule_entries'::regclass),
  'weekly schedule entries force RLS'
);
select ok(
  has_table_privilege(
    'authenticated',
    'api.training_plan_schedule_entries',
    'select'
  ),
  'authenticated clients can read their schedule'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'api.training_plan_schedule_entries',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'api.training_plan_schedule_entries',
    'update'
  )
  and not has_table_privilege(
    'authenticated',
    'api.training_plan_schedule_entries',
    'delete'
  ),
  'authenticated clients cannot mutate the derived schedule directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.rename_training_plan(uuid,text)',
    'execute'
  ),
  'anonymous clients cannot rename plans'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.cancel_training_session(uuid)',
    'execute'
  ),
  'anonymous clients cannot cancel a training session'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.cancel_training_session(uuid)',
    'execute'
  ),
  'authenticated clients can cancel their active training'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.rename_training_plan(uuid,text)',
    'execute'
  ),
  'authenticated clients can rename their plan'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.rename_training_plan(uuid,uuid,text)',
    'execute'
  ),
  'the privileged rename implementation is not directly callable'
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
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'schedule-owner-a@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'schedule-owner-b@example.invalid',
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
  'a3000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001',
  'Nome da planilha',
  'official_xlsx',
  1,
  3,
  3
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
  'a4000000-0000-4000-8000-000000000004',
  'a3000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001',
  1,
  'schedule-plan-import-0001',
  repeat('a', 64),
  'schedule-training.xlsx',
  1024
);

insert into api.training_plan_sessions (
  session_id,
  version_id,
  user_id,
  day_order,
  name
)
values
  (
    'a5000000-0000-4000-8000-000000000005',
    'a4000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    1,
    'Peito'
  ),
  (
    'a6000000-0000-4000-8000-000000000006',
    'a4000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    2,
    'Costas'
  ),
  (
    'a7000000-0000-4000-8000-000000000007',
    'a4000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    8,
    'Peito extra'
  );

update api.training_plans
set active_version_id = 'a4000000-0000-4000-8000-000000000004'
where plan_id = 'a3000000-0000-4000-8000-000000000003';

insert into api.training_session_runs (
  run_id,
  user_id,
  plan_id,
  plan_version_id,
  planned_session_id,
  operation_id
)
values (
  'a8000000-0000-4000-8000-000000000008',
  'a1000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003',
  'a4000000-0000-4000-8000-000000000004',
  'a5000000-0000-4000-8000-000000000005',
  'schedule-training-start-0001'
);

select is(
  (select count(*)
   from api.training_plan_schedule_entries
   where version_id = 'a4000000-0000-4000-8000-000000000004'),
  3::bigint,
  'every imported session receives a schedule entry'
);
select is(
  (select weekday from api.training_plan_schedule_entries
   where planned_session_id = 'a5000000-0000-4000-8000-000000000005'),
  1,
  'day one is Monday'
);
select is(
  (select weekday from api.training_plan_schedule_entries
   where planned_session_id = 'a6000000-0000-4000-8000-000000000006'),
  2,
  'day two is Tuesday'
);
select is(
  (select weekday from api.training_plan_schedule_entries
   where planned_session_id = 'a7000000-0000-4000-8000-000000000007'),
  1,
  'day eight wraps to a second Monday slot'
);
select is(
  (select slot_order from api.training_plan_schedule_entries
   where planned_session_id = 'a7000000-0000-4000-8000-000000000007'),
  2,
  'the second weekly cycle keeps an explicit slot'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from api.training_plan_schedule_entries),
  3::bigint,
  'the owner can read the full weekly agenda'
);
select is(
  (select plan_name from api.rename_training_plan(
    'a3000000-0000-4000-8000-000000000003',
    '  Treino - 14/08/2026  '
  )),
  'Treino - 14/08/2026',
  'the owner can save an edited plan name'
);
select is(
  (select name from api.training_plans),
  'Treino - 14/08/2026',
  'the edited name is persisted on the user-owned plan'
);
select throws_ok(
  $$select * from api.rename_training_plan(
    'a3000000-0000-4000-8000-000000000003',
    '   '
  )$$,
  '22023',
  'Plan name is invalid.',
  'an empty plan name is rejected'
);

select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);
-- RLS-N20: another authenticated user cannot read the weekly agenda.
select is(
  (select count(*) from api.training_plan_schedule_entries),
  0::bigint,
  'another user cannot read the schedule'
);
-- RLS-N21: another authenticated user cannot rename the plan.
select throws_ok(
  $$select * from api.rename_training_plan(
    'a3000000-0000-4000-8000-000000000003',
    'Plano invadido'
  )$$,
  '23514',
  'Active plan was not found.',
  'another user cannot rename the plan'
);
-- RLS-N22: another authenticated user cannot cancel the owner's active run.
select throws_ok(
  $$select * from api.cancel_training_session(
    'a8000000-0000-4000-8000-000000000008'
  )$$,
  '23514',
  'Active training was not found.',
  'another user cannot cancel the active training'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select was_cancelled from api.cancel_training_session(
    'a8000000-0000-4000-8000-000000000008'
  )),
  true,
  'the owner can cancel an active training explicitly'
);
select is(
  (select count(*) from api.training_session_runs),
  0::bigint,
  'cancellation removes the active run'
);

select * from finish();
rollback;
