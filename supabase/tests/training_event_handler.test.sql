begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

select has_table(
  'platform',
  'domain_event_receipts',
  'durable event handler receipts exist'
);
select has_column(
  'api',
  'training_sessions',
  'completion_consumed_at',
  'canonical sessions expose the server consumption state'
);
select has_function(
  'private',
  'handle_training_session_completed',
  array['jsonb'],
  'the concrete training completion handler exists'
);
select has_function(
  'private',
  'worker_handle_domain_event',
  array['jsonb'],
  'the worker handler router exists'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.handle_training_session_completed(jsonb)'::regprocedure
  ),
  'the concrete handler uses a definer transaction boundary'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.worker_handle_domain_event(jsonb)'::regprocedure
  ),
  'the worker router uses a definer boundary'
);

-- RLS-N10: runtimes cannot inspect receipts or bypass the bounded handler.
select ok(
  not has_table_privilege(
    'daygym_worker_runtime',
    'platform.domain_event_receipts',
    'select'
  ),
  'the worker cannot inspect durable receipts directly'
);
select ok(
  not has_function_privilege(
    'daygym_worker_runtime',
    'private.handle_training_session_completed(jsonb)',
    'execute'
  ),
  'the worker cannot bypass the event router'
);
select ok(
  has_function_privilege(
    'daygym_worker_runtime',
    'private.worker_handle_domain_event(jsonb)',
    'execute'
  ),
  'the worker can execute only the bounded event router'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.worker_handle_domain_event(jsonb)',
    'execute'
  ),
  'authenticated clients cannot execute worker handlers'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  'b1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'handler-user@example.invalid',
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
      'b2000000-0000-4000-8000-000000000002',
      'b1000000-0000-4000-8000-000000000001',
      'handler-operation-older',
      '2026-08-13T13:00:00.000000Z',
      1,
      'b3000000-0000-4000-8000-000000000003',
      'b4000000-0000-4000-8000-000000000004'
    )
  ),
  true,
  'the older canonical completion fixture is created'
);
select is(
  (
    select was_created
    from private.complete_training_session(
      'b5000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000001',
      'handler-operation-newer',
      '2026-08-13T13:05:00.000000Z',
      1,
      'b6000000-0000-4000-8000-000000000006',
      'b7000000-0000-4000-8000-000000000007'
    )
  ),
  true,
  'the newer canonical completion fixture is created'
);

select is(
  private.worker_handle_domain_event(
    (
      select event_envelope
      from platform.job_outbox
      where event_id = 'b6000000-0000-4000-8000-000000000006'
    )
  ),
  'processed',
  'the newer event can be processed first'
);
select is(
  private.worker_handle_domain_event(
    (
      select event_envelope
      from platform.job_outbox
      where event_id = 'b3000000-0000-4000-8000-000000000003'
    )
  ),
  'processed',
  'the older event remains valid when delivered later'
);
select is(
  (
    select count(*)
    from api.training_sessions
    where completion_consumed_at is not null
  ),
  2::bigint,
  'out-of-order delivery consumes both independent sessions'
);
select is(
  (select count(*) from platform.domain_event_receipts),
  2::bigint,
  'each handled event has one payload-free durable receipt'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'platform'
      and table_name = 'domain_event_receipts'
      and column_name in ('payload', 'user_id', 'session_id', 'correlation_id')
  ),
  0::bigint,
  'receipts do not retain event payload or user identifiers'
);
select is(
  private.worker_handle_domain_event(
    (
      select event_envelope
      from platform.job_outbox
      where event_id = 'b6000000-0000-4000-8000-000000000006'
    )
  ),
  'already-processed',
  'an exact replay returns the durable idempotent outcome'
);
select is(
  (select count(*) from platform.domain_event_receipts),
  2::bigint,
  'replay does not duplicate the durable effect'
);
select throws_ok(
  $$select private.worker_handle_domain_event(
    jsonb_set(
      (
        select event_envelope
        from platform.job_outbox
        where event_id = 'b6000000-0000-4000-8000-000000000006'
      ),
      '{payload,version}',
      '2'::jsonb
    )
  )$$,
  '23514',
  'Training completion event does not match canonical state.',
  'a replay with altered canonical content fails closed'
);
select throws_ok(
  $$select private.worker_handle_domain_event(
    '{"event_name":"UnknownEvent"}'::jsonb
  )$$,
  '0A000',
  'Domain event handler is unavailable.',
  'an event without an implemented handler remains unavailable'
);
select throws_ok(
  $$select private.worker_handle_domain_event(
    '{"event_name":"TrainingSessionCompleted"}'::jsonb
  )$$,
  '23514',
  'Training completion event is invalid.',
  'a malformed training event fails closed'
);
select throws_ok(
  $$select private.worker_handle_domain_event(
    '{
      "event_id": "b8000000-0000-4000-8000-000000000008",
      "event_name": "TrainingSessionCompleted",
      "event_version": 1,
      "occurred_at": "2026-08-13T13:10:00.000000Z",
      "correlation_id": "b9000000-0000-4000-8000-000000000009",
      "producer": "training",
      "payload": {
        "session_id": "ba000000-0000-4000-8000-000000000010",
        "user_id": "b1000000-0000-4000-8000-000000000001",
        "occurred_at": "2026-08-13T13:10:00.000000Z",
        "version": 1
      }
    }'::jsonb
  )$$,
  '23503',
  'Training completion source was not found.',
  'an event without canonical source cannot create a receipt'
);
select is(
  (
    select count(*)
    from platform.domain_event_receipts
    where event_id = 'b8000000-0000-4000-8000-000000000008'
  ),
  0::bigint,
  'a rejected event leaves no partial receipt'
);
select is(
  (
    select count(*)
    from platform.domain_event_receipts
    where consumer_name = 'training.completion.v1'
      and event_name = 'TrainingSessionCompleted'
      and event_version = 1
  ),
  2::bigint,
  'receipts identify the exact versioned consumer contract'
);

select * from finish();
rollback;
