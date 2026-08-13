begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(28);

select has_table(
  'api',
  'training_sessions',
  'canonical completed training sessions exist'
);
select has_function(
  'private',
  'complete_training_session',
  array['uuid', 'uuid', 'text', 'timestamptz', 'integer', 'uuid', 'uuid'],
  'server-owned training completion command exists'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.complete_training_session(uuid,uuid,text,timestamptz,integer,uuid,uuid)'::regprocedure
  ),
  'training completion uses the definer boundary'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'api.training_sessions'::regclass),
  'training sessions have RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'api.training_sessions'::regclass),
  'training sessions force RLS for table owners'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'api.training_sessions'::regclass
      and confrelid = 'api.profiles'::regclass
      and contype = 'f'
  ),
  'a completed session requires an eligible profile'
);
select ok(
  has_table_privilege('authenticated', 'api.training_sessions', 'select'),
  'authenticated users can read their sessions through RLS'
);

-- RLS-N09: clients can read only their own sessions and cannot mutate them.
select ok(
  not has_table_privilege('authenticated', 'api.training_sessions', 'insert')
    and not has_table_privilege('authenticated', 'api.training_sessions', 'update')
    and not has_table_privilege('authenticated', 'api.training_sessions', 'delete'),
  'authenticated clients cannot mutate canonical training sessions directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.complete_training_session(uuid,uuid,text,timestamptz,integer,uuid,uuid)',
    'execute'
  ),
  'authenticated clients cannot bypass the future versioned command adapter'
);
select ok(
  not has_function_privilege(
    'daygym_worker_runtime',
    'private.complete_training_session(uuid,uuid,text,timestamptz,integer,uuid,uuid)',
    'execute'
  ),
  'the queue worker cannot issue training commands'
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
    '91000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'training-a@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '92000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'training-b@example.invalid',
    '{
      "daygym_account_creation": "v1",
      "daygym_is_adult": true,
      "daygym_terms_version": "2026-08-13",
      "daygym_privacy_version": "2026-08-13"
    }'::jsonb
  );

select is(
  (
    select was_created
    from private.complete_training_session(
      '93000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000001',
      'training-complete-0001',
      '2026-08-13T12:00:00.123456Z',
      1,
      '94000000-0000-4000-8000-000000000004',
      '95000000-0000-4000-8000-000000000005'
    )
  ),
  true,
  'the first command creates canonical state'
);
select is(
  (select count(*) from api.training_sessions),
  1::bigint,
  'the command stores one completed session'
);
select is(
  (
    select count(*)
    from platform.job_outbox
    where event_id = '94000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'the same command stores exactly one completion event'
);
select is(
  (
    select event_envelope #>> '{payload,session_id}'
    from platform.job_outbox
    where event_id = '94000000-0000-4000-8000-000000000004'
  ),
  '93000000-0000-4000-8000-000000000003',
  'the event references the canonical session'
);
select is(
  (
    select event_envelope #>> '{payload,occurred_at}'
    from platform.job_outbox
    where event_id = '94000000-0000-4000-8000-000000000004'
  ),
  '2026-08-13T12:00:00.123456Z',
  'the event preserves the UTC completion timestamp'
);
select is(
  (
    select event_envelope::text
    from platform.job_outbox
    where event_id = '94000000-0000-4000-8000-000000000004'
  ),
  '{
    "event_id": "94000000-0000-4000-8000-000000000004",
    "event_name": "TrainingSessionCompleted",
    "event_version": 1,
    "occurred_at": "2026-08-13T12:00:00.123456Z",
    "correlation_id": "95000000-0000-4000-8000-000000000005",
    "producer": "training",
    "payload": {
      "session_id": "93000000-0000-4000-8000-000000000003",
      "user_id": "91000000-0000-4000-8000-000000000001",
      "occurred_at": "2026-08-13T12:00:00.123456Z",
      "version": 1
    }
  }'::jsonb::text,
  'the producer emits exactly the approved v1 envelope'
);

select is(
  (
    select was_created
    from private.complete_training_session(
      '93000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000001',
      'training-complete-0001',
      '2026-08-13T12:00:00.123456Z',
      1,
      '96000000-0000-4000-8000-000000000006',
      '97000000-0000-4000-8000-000000000007'
    )
  ),
  false,
  'an exact operation replay returns the canonical result'
);
select is(
  (
    select completion_event_id
    from private.complete_training_session(
      '93000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000001',
      'training-complete-0001',
      '2026-08-13T12:00:00.123456Z',
      1,
      '96000000-0000-4000-8000-000000000006',
      '97000000-0000-4000-8000-000000000007'
    )
  ),
  '94000000-0000-4000-8000-000000000004'::uuid,
  'operation replay reuses the original event identity'
);
select is(
  (select count(*) from api.training_sessions),
  1::bigint,
  'operation replay does not duplicate canonical state'
);
select is(
  (
    select count(*)
    from platform.job_outbox
    where event_name = 'TrainingSessionCompleted'
      and event_envelope #>> '{payload,session_id}' =
        '93000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'operation replay does not duplicate the domain event'
);
select throws_ok(
  $$select * from private.complete_training_session(
    '93000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001',
    'training-complete-0001',
    '2026-08-13T12:00:00.123456Z',
    2,
    '98000000-0000-4000-8000-000000000008',
    '99000000-0000-4000-8000-000000000009'
  )$$,
  '23505',
  'Training operation identifier was reused with different content.',
  'the same operation cannot hide different content'
);
select throws_ok(
  $$select * from private.complete_training_session(
    '93000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001',
    'training-complete-0002',
    '2026-08-13T12:00:00.123456Z',
    1,
    'a0000000-0000-4000-8000-000000000010',
    'a1000000-0000-4000-8000-000000000011'
  )$$,
  '23505',
  'Training session identifier conflicts with another command.',
  'one canonical session cannot be claimed by another operation'
);
select throws_ok(
  $$select * from private.complete_training_session(
    'a2000000-0000-4000-8000-000000000012',
    '91000000-0000-4000-8000-000000000001',
    'short',
    '2026-08-13T12:00:00Z',
    1,
    'a3000000-0000-4000-8000-000000000013',
    'a4000000-0000-4000-8000-000000000014'
  )$$,
  '22023',
  'Training completion command is invalid.',
  'an invalid idempotency key fails closed'
);

select is(
  private.enqueue_domain_event(
    '{
      "event_id": "a5000000-0000-4000-8000-000000000015",
      "event_name": "TrainingSessionCompleted",
      "event_version": 1,
      "occurred_at": "2026-08-13T12:05:00.000Z",
      "correlation_id": "a6000000-0000-4000-8000-000000000016",
      "producer": "training",
      "payload": {
        "session_id": "collision-fixture",
        "user_id": "fixture-user",
        "occurred_at": "2026-08-13T12:05:00.000Z",
        "version": 1
      }
    }'::jsonb
  ),
  'a5000000-0000-4000-8000-000000000015'::uuid,
  'the collision fixture occupies one event identity'
);
select throws_ok(
  $$select * from private.complete_training_session(
    'a7000000-0000-4000-8000-000000000017',
    '91000000-0000-4000-8000-000000000001',
    'training-complete-rollback',
    '2026-08-13T12:05:00Z',
    1,
    'a5000000-0000-4000-8000-000000000015',
    'a8000000-0000-4000-8000-000000000018'
  )$$,
  '23505',
  'Domain event identifier was reused with different content.',
  'an enqueue failure aborts the completion command'
);
select is(
  (
    select count(*)
    from api.training_sessions
    where session_id = 'a7000000-0000-4000-8000-000000000017'
  ),
  0::bigint,
  'enqueue failure rolls canonical state back atomically'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from api.training_sessions),
  0::bigint,
  'another authenticated user cannot read the session'
);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from api.training_sessions),
  1::bigint,
  'the owner can read the canonical session'
);

select * from finish();
rollback;
