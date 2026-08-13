begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

select ok(
  exists (select 1 from pg_roles where rolname = 'daygym_worker'),
  'worker capability role exists'
);
select ok(
  exists (select 1 from pg_roles where rolname = 'daygym_worker_runtime'),
  'worker runtime login exists'
);
select ok(
  (
    select
      rolcanlogin
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
      and not rolbypassrls
      and rolconnlimit = 2
    from pg_authid
    where rolname = 'daygym_worker_runtime'
  ),
  'runtime login privileges and connection limit are bounded'
);
select ok(
  exists (
    select 1
    from pg_auth_members as membership
    join pg_roles as parent on parent.oid = membership.roleid
    join pg_roles as child on child.oid = membership.member
    where parent.rolname = 'daygym_worker'
      and child.rolname = 'daygym_worker_runtime'
  ),
  'runtime login inherits the worker capability role'
);
select has_function(
  'private',
  'worker_dispatch_domain_events',
  array['integer'],
  'bounded worker dispatcher exists'
);
select has_function(
  'private',
  'worker_read_domain_events',
  array['integer', 'integer'],
  'bounded worker queue read exists'
);
select has_function(
  'private',
  'worker_archive_domain_event',
  array['bigint'],
  'worker archive operation exists'
);
select ok(
  (
    select bool_and(prosecdef)
    from pg_proc
    where oid in (
      'private.worker_dispatch_domain_events(integer)'::regprocedure,
      'private.worker_read_domain_events(integer,integer)'::regprocedure,
      'private.worker_archive_domain_event(bigint)'::regprocedure
    )
  ),
  'queue wrappers use a server-owned definer boundary'
);
select ok(
  has_function_privilege(
    'daygym_worker_runtime',
    'private.worker_dispatch_domain_events(integer)',
    'execute'
  )
    and has_function_privilege(
      'daygym_worker_runtime',
      'private.worker_read_domain_events(integer,integer)',
      'execute'
    )
    and has_function_privilege(
      'daygym_worker_runtime',
      'private.worker_archive_domain_event(bigint)',
      'execute'
    ),
  'runtime login can execute only the worker queue boundary'
);
select ok(
  not has_function_privilege(
    'daygym_worker_runtime',
    'private.enqueue_domain_event(jsonb)',
    'execute'
  ),
  'worker cannot originate domain events'
);

-- RLS-N08: the worker enters only the bounded private function boundary.
select ok(
  not has_schema_privilege('daygym_worker_runtime', 'pgmq', 'usage')
    and not has_table_privilege(
      'daygym_worker_runtime',
      'platform.job_outbox',
      'select'
    ),
  'worker cannot bypass wrappers to inspect queue or outbox storage'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.worker_read_domain_events(integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'private.worker_archive_domain_event(bigint)',
      'execute'
    ),
  'client roles cannot enter the worker boundary'
);

select is(
  private.enqueue_domain_event(
    '{
      "event_id": "74000000-0000-4000-8000-000000000022",
      "event_name": "TrainingSessionCompleted",
      "event_version": 1,
      "occurred_at": "2026-08-13T10:45:00.000Z",
      "correlation_id": "75000000-0000-4000-8000-000000000022",
      "producer": "worker-runtime-test",
      "payload": {
        "session_id": "session-22",
        "user_id": "user-22",
        "occurred_at": "2026-08-13T10:44:00.000Z",
        "version": 1
      }
    }'::jsonb
  ),
  '74000000-0000-4000-8000-000000000022'::uuid,
  'server boundary creates a synthetic event for the worker test'
);

select is(
  private.worker_dispatch_domain_events(10),
  1,
  'worker dispatches the pending synthetic event'
);
select is(
  (
    select count(*)
    from private.worker_read_domain_events(30, 10)
    where payload ->> 'event_id' =
      '74000000-0000-4000-8000-000000000022'
  ),
  1::bigint,
  'worker reads the validated event through its bounded wrapper'
);

select set_config(
  'daygym.test_message_id',
  (
    select queue_message_id::text
    from platform.job_outbox
    where event_id = '74000000-0000-4000-8000-000000000022'::uuid
  ),
  true
);

select ok(
  private.worker_archive_domain_event(
    current_setting('daygym.test_message_id')::bigint
  ),
  'worker archives the event after a successful consumer effect'
);
select ok(
  not private.worker_archive_domain_event(
    current_setting('daygym.test_message_id')::bigint
  ),
  'archive replay is safe and reports that no live message remained'
);

select * from finish();
rollback;
