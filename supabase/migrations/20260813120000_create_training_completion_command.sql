-- FND-022: first functional command proving canonical state + outbox atomically.
begin;

create table api.training_sessions (
  session_id uuid primary key,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  operation_id text not null,
  completed_at timestamptz not null,
  version integer not null,
  completion_event_id uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  constraint training_sessions_operation_id_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint training_sessions_version_positive check (version > 0),
  constraint training_sessions_user_operation_unique unique (user_id, operation_id)
);

create index training_sessions_user_completed_idx
on api.training_sessions (user_id, completed_at desc, session_id desc);

comment on table api.training_sessions is
  'Canonical completed training sessions; active-session details enter in M1.';
comment on column api.training_sessions.operation_id is
  'Client-stable idempotency key for offline synchronization replay.';
comment on column api.training_sessions.completion_event_id is
  'Stable outbox event emitted by the first successful completion command.';

alter table api.training_sessions enable row level security;
alter table api.training_sessions force row level security;

create policy training_sessions_select_own
on api.training_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_sessions from public, anon, authenticated;
grant select on table api.training_sessions to authenticated;

create function private.complete_training_session(
  requested_session_id uuid,
  actor_user_id uuid,
  requested_operation_id text,
  requested_completed_at timestamptz,
  requested_version integer,
  requested_event_id uuid,
  requested_correlation_id uuid
)
returns table (
  canonical_session_id uuid,
  completion_event_id uuid,
  session_version integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_session api.training_sessions%rowtype;
  inserted_session boolean := false;
  occurred_at_utc text;
begin
  if requested_session_id is null
    or actor_user_id is null
    or requested_event_id is null
    or requested_correlation_id is null
    or requested_completed_at is null
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or requested_version is null
    or requested_version < 1
  then
    raise exception using
      errcode = '22023',
      message = 'Training completion command is invalid.';
  end if;

  insert into api.training_sessions (
    session_id,
    user_id,
    operation_id,
    completed_at,
    version,
    completion_event_id
  )
  values (
    requested_session_id,
    actor_user_id,
    requested_operation_id,
    requested_completed_at,
    requested_version,
    requested_event_id
  )
  on conflict do nothing
  returning * into stored_session;

  if found then
    inserted_session := true;
  else
    select session.*
    into stored_session
    from api.training_sessions as session
    where session.user_id = actor_user_id
      and session.operation_id = requested_operation_id;

    if not found then
      raise exception using
        errcode = '23505',
        message = 'Training session identifier conflicts with another command.';
    end if;

    if stored_session.session_id is distinct from requested_session_id
      or stored_session.completed_at is distinct from requested_completed_at
      or stored_session.version is distinct from requested_version
    then
      raise exception using
        errcode = '23505',
        message = 'Training operation identifier was reused with different content.';
    end if;
  end if;

  if inserted_session then
    occurred_at_utc := to_char(
      requested_completed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );

    perform private.enqueue_domain_event(
      jsonb_build_object(
        'event_id', requested_event_id,
        'event_name', 'TrainingSessionCompleted',
        'event_version', 1,
        'occurred_at', occurred_at_utc,
        'correlation_id', requested_correlation_id,
        'producer', 'training',
        'payload', jsonb_build_object(
          'session_id', requested_session_id::text,
          'user_id', actor_user_id::text,
          'occurred_at', occurred_at_utc,
          'version', requested_version
        )
      )
    );
  end if;

  return query
  select
    stored_session.session_id,
    stored_session.completion_event_id,
    stored_session.version,
    inserted_session;
end;
$$;

comment on function private.complete_training_session(
  uuid,
  uuid,
  text,
  timestamptz,
  integer,
  uuid,
  uuid
) is
  'Idempotently stores one completed session and its domain event in one transaction.';

revoke all on function private.complete_training_session(
  uuid,
  uuid,
  text,
  timestamptz,
  integer,
  uuid,
  uuid
) from public, anon, authenticated, daygym_worker, daygym_worker_runtime;

commit;
