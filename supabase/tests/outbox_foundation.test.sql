begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(20);

select ok(
  exists (select 1 from pg_extension where extname = 'pgmq'),
  'pgmq extension is enabled'
);
select has_schema('platform', 'private platform schema exists');
select has_table(
  'platform',
  'job_outbox',
  'private transactional outbox exists'
);
select has_function(
  'private',
  'enqueue_domain_event',
  array['jsonb'],
  'server-owned enqueue function exists'
);
select has_function(
  'private',
  'dispatch_domain_events',
  array['integer'],
  'server-owned dispatcher exists'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.enqueue_domain_event(jsonb)'::regprocedure
  ),
  'enqueue uses the server-owned definer boundary'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.dispatch_domain_events(integer)'::regprocedure
  ),
  'dispatcher uses the server-owned definer boundary'
);

-- RLS-N07: application roles cannot enter the internal platform schema.
select ok(
  not has_schema_privilege('anon', 'platform', 'usage')
    and not has_schema_privilege('authenticated', 'platform', 'usage'),
  'application roles cannot use the platform schema'
);
select ok(
  not has_table_privilege('authenticated', 'platform.job_outbox', 'select'),
  'authenticated clients cannot inspect event payloads'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.enqueue_domain_event(jsonb)',
    'execute'
  ),
  'authenticated clients cannot enqueue domain events'
);
select ok(
  not has_schema_privilege('authenticated', 'pgmq', 'usage'),
  'authenticated clients cannot enter the queue schema'
);

select is(
  private.enqueue_domain_event(
    '{
      "event_id": "70000000-0000-4000-8000-000000000007",
      "event_name": "TrainingSessionCompleted",
      "event_version": 1,
      "occurred_at": "2026-08-13T08:15:00.000Z",
      "correlation_id": "71000000-0000-4000-8000-000000000007",
      "producer": "training",
      "payload": {
        "session_id": "session-07",
        "user_id": "user-07",
        "occurred_at": "2026-08-13T08:15:00.000Z",
        "version": 1
      }
    }'::jsonb
  ),
  '70000000-0000-4000-8000-000000000007'::uuid,
  'a valid approved event enters the outbox'
);
select is(
  (select count(*) from platform.job_outbox),
  1::bigint,
  'the outbox contains one event'
);
select is(
  private.enqueue_domain_event(
    '{
      "event_id": "70000000-0000-4000-8000-000000000007",
      "event_name": "TrainingSessionCompleted",
      "event_version": 1,
      "occurred_at": "2026-08-13T08:15:00.000Z",
      "correlation_id": "71000000-0000-4000-8000-000000000007",
      "producer": "training",
      "payload": {
        "session_id": "session-07",
        "user_id": "user-07",
        "occurred_at": "2026-08-13T08:15:00.000Z",
        "version": 1
      }
    }'::jsonb
  ),
  '70000000-0000-4000-8000-000000000007'::uuid,
  'exact replay returns the existing event identifier'
);
select is(
  (select count(*) from platform.job_outbox),
  1::bigint,
  'exact replay does not duplicate the outbox event'
);
select throws_ok(
  $$select private.enqueue_domain_event(
    jsonb_set(
      (select event_envelope from platform.job_outbox limit 1),
      '{payload,version}',
      '2'::jsonb
    )
  )$$,
  '23505',
  'Domain event identifier was reused with different content.',
  'the same event identifier cannot hide different content'
);
select throws_ok(
  $$select private.enqueue_domain_event(
    '{
      "event_id": "72000000-0000-4000-8000-000000000007",
      "event_name": "UnknownEvent",
      "event_version": 1,
      "occurred_at": "2026-08-13T08:15:00.000Z",
      "correlation_id": "73000000-0000-4000-8000-000000000007",
      "producer": "training",
      "payload": {}
    }'::jsonb
  )$$,
  '23514',
  'Domain event envelope is invalid.',
  'an undeclared event name is rejected'
);
select is(
  private.dispatch_domain_events(50),
  1,
  'the dispatcher publishes one pending event'
);
select is(
  private.dispatch_domain_events(50),
  0,
  'dispatcher replay does not publish the event twice'
);
select is(
  (
    select count(*)
    from pgmq.q_domain_events
    where message ->> 'event_id' =
      '70000000-0000-4000-8000-000000000007'
  ),
  1::bigint,
  'the durable queue contains exactly one copy of the event'
);

select * from finish();
rollback;
