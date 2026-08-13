-- FND-022: durable idempotent handler for TrainingSessionCompleted.
begin;

alter table api.training_sessions
add column completion_consumed_at timestamptz;

comment on column api.training_sessions.completion_consumed_at is
  'Server timestamp confirming the completion event passed its durable handler.';

create table platform.domain_event_receipts (
  consumer_name text not null,
  event_id uuid not null,
  event_name text not null,
  event_version smallint not null,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default statement_timestamp(),
  primary key (consumer_name, event_id),
  constraint domain_event_receipts_consumer_name check (
    char_length(consumer_name) between 1 and 80
    and consumer_name ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint domain_event_receipts_event_name check (
    event_name = 'TrainingSessionCompleted'
  ),
  constraint domain_event_receipts_event_version check (event_version = 1)
);

comment on table platform.domain_event_receipts is
  'Payload-free durable idempotency receipts for completed domain event handlers.';

revoke all on table platform.domain_event_receipts
from public, anon, authenticated, daygym_worker, daygym_worker_runtime;

create function private.handle_training_session_completed(
  event_envelope jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_version_value smallint;
  occurred_at_value timestamptz;
  correlation_id_value uuid;
  session_id_value uuid;
  user_id_value uuid;
  payload_occurred_at_value timestamptz;
  session_version_value integer;
  stored_session api.training_sessions%rowtype;
  inserted_count integer;
begin
  if jsonb_typeof(event_envelope) is distinct from 'object'
    or not event_envelope ?& array[
      'event_id',
      'event_name',
      'event_version',
      'occurred_at',
      'correlation_id',
      'producer',
      'payload'
    ]
    or event_envelope - array[
      'event_id',
      'event_name',
      'event_version',
      'occurred_at',
      'correlation_id',
      'producer',
      'payload'
    ] <> '{}'::jsonb
    or jsonb_typeof(event_envelope -> 'payload') is distinct from 'object'
    or not (event_envelope -> 'payload') ?& array[
      'session_id',
      'user_id',
      'occurred_at',
      'version'
    ]
    or (event_envelope -> 'payload') - array[
      'session_id',
      'user_id',
      'occurred_at',
      'version'
    ] <> '{}'::jsonb
  then
    raise exception using
      errcode = '23514',
      message = 'Training completion event is invalid.';
  end if;

  begin
    event_id_value := (event_envelope ->> 'event_id')::uuid;
    event_version_value := (event_envelope ->> 'event_version')::smallint;
    occurred_at_value := (event_envelope ->> 'occurred_at')::timestamptz;
    correlation_id_value := (event_envelope ->> 'correlation_id')::uuid;
    session_id_value := (event_envelope #>> '{payload,session_id}')::uuid;
    user_id_value := (event_envelope #>> '{payload,user_id}')::uuid;
    payload_occurred_at_value :=
      (event_envelope #>> '{payload,occurred_at}')::timestamptz;
    session_version_value :=
      (event_envelope #>> '{payload,version}')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using
        errcode = '23514',
        message = 'Training completion event is invalid.';
  end;

  if event_envelope ->> 'event_name' <> 'TrainingSessionCompleted'
    or event_envelope ->> 'producer' <> 'training'
    or event_version_value <> 1
    or session_version_value < 1
    or event_envelope ->> 'occurred_at' !~ 'Z$'
    or event_envelope #>> '{payload,occurred_at}' !~ 'Z$'
    or occurred_at_value is distinct from payload_occurred_at_value
  then
    raise exception using
      errcode = '23514',
      message = 'Training completion event is invalid.';
  end if;

  select session.*
  into stored_session
  from api.training_sessions as session
  where session.session_id = session_id_value
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Training completion source was not found.';
  end if;

  if stored_session.user_id is distinct from user_id_value
    or stored_session.completed_at is distinct from payload_occurred_at_value
    or stored_session.version is distinct from session_version_value
    or stored_session.completion_event_id is distinct from event_id_value
  then
    raise exception using
      errcode = '23514',
      message = 'Training completion event does not match canonical state.';
  end if;

  insert into platform.domain_event_receipts (
    consumer_name,
    event_id,
    event_name,
    event_version,
    occurred_at
  )
  values (
    'training.completion.v1',
    event_id_value,
    'TrainingSessionCompleted',
    event_version_value,
    occurred_at_value
  )
  on conflict (consumer_name, event_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    if stored_session.completion_consumed_at is null then
      raise exception using
        errcode = '23514',
        message = 'Training completion receipt is inconsistent.';
    end if;

    return 'already-processed';
  end if;

  update api.training_sessions
  set completion_consumed_at = statement_timestamp()
  where session_id = session_id_value
    and completion_consumed_at is null;

  return 'processed';
end;
$$;

create function private.worker_handle_domain_event(event_envelope jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if event_envelope ->> 'event_name' = 'TrainingSessionCompleted' then
    return private.handle_training_session_completed(event_envelope);
  end if;

  raise exception using
    errcode = '0A000',
    message = 'Domain event handler is unavailable.';
end;
$$;

comment on function private.handle_training_session_completed(jsonb) is
  'Validates canonical training state and applies one durable completion receipt.';
comment on function private.worker_handle_domain_event(jsonb) is
  'Least-privilege worker router for implemented domain event handlers.';

revoke all on function private.handle_training_session_completed(jsonb)
from public, anon, authenticated, daygym_worker, daygym_worker_runtime;
revoke all on function private.worker_handle_domain_event(jsonb)
from public, anon, authenticated;

grant execute on function private.worker_handle_domain_event(jsonb)
to daygym_worker;

commit;
