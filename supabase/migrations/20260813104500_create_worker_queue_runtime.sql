-- FND-022: least-privilege database identity and queue RPCs for the worker.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'daygym_worker') then
    create role daygym_worker
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;

  if not exists (
    select 1 from pg_roles where rolname = 'daygym_worker_runtime'
  ) then
    create role daygym_worker_runtime
      login
      inherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls
      connection limit 2;
  end if;
end;
$$;

grant daygym_worker to daygym_worker_runtime;
grant usage on schema private to daygym_worker;

create function private.worker_dispatch_domain_events(
  batch_size integer default 10
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.dispatch_domain_events(batch_size);
$$;

create function private.worker_read_domain_events(
  visibility_timeout_seconds integer default 30,
  batch_size integer default 10
)
returns table (
  message_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visible_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if visibility_timeout_seconds < 5 or visibility_timeout_seconds > 300 then
    raise exception using
      errcode = '22023',
      message = 'Visibility timeout must be between 5 and 300 seconds.';
  end if;

  if batch_size < 1 or batch_size > 10 then
    raise exception using
      errcode = '22023',
      message = 'Worker batch size must be between 1 and 10.';
  end if;

  return query
  select
    message.msg_id,
    message.read_ct,
    message.enqueued_at,
    message.vt,
    message.message
  from pgmq.read(
    queue_name => 'domain_events',
    vt => visibility_timeout_seconds,
    qty => batch_size
  ) as message;
end;
$$;

create function private.worker_archive_domain_event(message_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if message_id < 1 then
    raise exception using
      errcode = '22023',
      message = 'Queue message identifier must be positive.';
  end if;

  return pgmq.archive(
    queue_name => 'domain_events',
    msg_id => message_id
  );
end;
$$;

comment on role daygym_worker is
  'Non-login least-privilege capability role for the DayGym queue worker.';
comment on role daygym_worker_runtime is
  'Login role used only by the DayGym worker; password is provisioned outside migrations.';
comment on function private.worker_dispatch_domain_events(integer) is
  'Worker-only wrapper that publishes pending outbox events in a bounded batch.';
comment on function private.worker_read_domain_events(integer, integer) is
  'Worker-only bounded read from domain_events with an explicit visibility timeout.';
comment on function private.worker_archive_domain_event(bigint) is
  'Worker-only archive operation used only after an idempotent handler succeeds.';

revoke all on function private.worker_dispatch_domain_events(integer)
from public, anon, authenticated;
revoke all on function private.worker_read_domain_events(integer, integer)
from public, anon, authenticated;
revoke all on function private.worker_archive_domain_event(bigint)
from public, anon, authenticated;

grant execute on function private.worker_dispatch_domain_events(integer)
to daygym_worker;
grant execute on function private.worker_read_domain_events(integer, integer)
to daygym_worker;
grant execute on function private.worker_archive_domain_event(bigint)
to daygym_worker;

commit;
