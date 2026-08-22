-- US-009B1: replayable training commands preserve the instant recorded by the
-- client and make cancellation safe after an ambiguous network response.
begin;

create table private.training_session_command_receipts (
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  operation_id text not null,
  command_kind text not null,
  run_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, operation_id),
  constraint training_session_command_receipts_kind check (
    command_kind in ('cancel-session')
  ),
  constraint training_session_command_receipts_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  )
);

comment on table private.training_session_command_receipts is
  'Minimal idempotency receipt for destructive client-outbox commands.';

revoke all on table private.training_session_command_receipts
from public, anon, authenticated;

create function private.start_training_session_at(
  actor_user_id uuid,
  requested_planned_session_id uuid,
  requested_run_id uuid,
  requested_operation_id text,
  requested_started_at timestamptz
)
returns table (
  active_run_id uuid,
  active_planned_session_id uuid,
  active_started_at timestamptz,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  started record;
begin
  if requested_started_at is null
    or requested_started_at > statement_timestamp() + interval '5 minutes'
    or requested_started_at < statement_timestamp() - interval '7 days'
  then
    raise exception using errcode = '22023', message = 'Training start instant is invalid.';
  end if;

  select * into started
  from private.start_training_session(
    actor_user_id,
    requested_planned_session_id,
    requested_run_id,
    requested_operation_id
  );

  if started.active_run_id is distinct from requested_run_id then
    raise exception using errcode = '23505', message = 'Another training is already active.';
  end if;

  if started.was_created then
    update api.training_session_runs as run
    set
      started_at = requested_started_at,
      updated_at = greatest(run.updated_at, requested_started_at)
    where run.run_id = requested_run_id
      and run.user_id = actor_user_id;
  end if;

  return query select
    started.active_run_id,
    started.active_planned_session_id,
    case when started.was_created then requested_started_at else started.active_started_at end,
    started.was_created;
end;
$$;

create function private.pause_training_session_at(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_paused_at timestamptz
)
returns table (
  active_run_id uuid,
  active_paused_at timestamptz,
  active_paused_duration_seconds integer,
  was_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_run api.training_session_runs%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id and run.user_id = actor_user_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;
  if requested_paused_at is null
    or requested_paused_at < stored_run.started_at
    or requested_paused_at > statement_timestamp() + interval '5 minutes'
  then
    raise exception using errcode = '22023', message = 'Training pause instant is invalid.';
  end if;
  if stored_run.paused_at is null then
    update api.training_session_runs as run
    set paused_at = requested_paused_at, updated_at = statement_timestamp()
    where run.run_id = requested_run_id and run.user_id = actor_user_id
    returning run.* into stored_run;
    return query select stored_run.run_id, stored_run.paused_at,
      stored_run.paused_duration_seconds, true;
    return;
  end if;
  return query select stored_run.run_id, stored_run.paused_at,
    stored_run.paused_duration_seconds, false;
end;
$$;

create function private.resume_training_session_at(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_resumed_at timestamptz
)
returns table (
  active_run_id uuid,
  active_paused_at timestamptz,
  active_paused_duration_seconds integer,
  was_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_run api.training_session_runs%rowtype;
  additional_paused_seconds integer;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id and run.user_id = actor_user_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;
  if requested_resumed_at is null
    or requested_resumed_at < stored_run.started_at
    or requested_resumed_at > statement_timestamp() + interval '5 minutes'
  then
    raise exception using errcode = '22023', message = 'Training resume instant is invalid.';
  end if;
  if stored_run.paused_at is null then
    return query select stored_run.run_id, null::timestamptz,
      stored_run.paused_duration_seconds, false;
    return;
  end if;
  if requested_resumed_at < stored_run.paused_at then
    raise exception using errcode = '22023', message = 'Training resume precedes its pause.';
  end if;
  additional_paused_seconds := greatest(
    0,
    floor(extract(epoch from (requested_resumed_at - stored_run.paused_at)))::integer
  );
  update api.training_session_runs as run
  set
    paused_at = null,
    paused_duration_seconds = run.paused_duration_seconds + additional_paused_seconds,
    updated_at = statement_timestamp()
  where run.run_id = requested_run_id and run.user_id = actor_user_id
  returning run.* into stored_run;
  return query select stored_run.run_id, stored_run.paused_at,
    stored_run.paused_duration_seconds, true;
end;
$$;

create function private.cancel_training_session_once(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_operation_id text
)
returns table (cancelled_run_id uuid, was_cancelled boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt private.training_session_command_receipts%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_run_id is null
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then
    raise exception using errcode = '22023', message = 'Training cancellation command is invalid.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));
  select command.* into receipt
  from private.training_session_command_receipts as command
  where command.user_id = actor_user_id
    and command.operation_id = requested_operation_id;
  if found then
    if receipt.run_id is distinct from requested_run_id
      or receipt.command_kind is distinct from 'cancel-session'
    then
      raise exception using errcode = '23505', message = 'Training operation identifier was reused with different content.';
    end if;
    return query select receipt.run_id, false;
    return;
  end if;
  delete from api.training_session_runs as run
  where run.run_id = requested_run_id and run.user_id = actor_user_id;
  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;
  insert into private.training_session_command_receipts (
    user_id, operation_id, command_kind, run_id, occurred_at
  ) values (
    actor_user_id, requested_operation_id, 'cancel-session', requested_run_id,
    statement_timestamp()
  );
  return query select requested_run_id, true;
end;
$$;

create function private.finish_practical_training_session_at(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_session_id uuid,
  requested_operation_id text,
  requested_event_id uuid,
  requested_correlation_id uuid,
  requested_completed_at timestamptz
)
returns table (
  canonical_session_id uuid,
  canonical_completed_at timestamptz,
  canonical_duration_seconds integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_run api.training_session_runs%rowtype;
  stored_session api.training_sessions%rowtype;
  item_total integer;
  item_completed integer;
  completion_result record;
  elapsed_seconds integer;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_run_id is null
    or requested_session_id is null
    or requested_event_id is null
    or requested_correlation_id is null
    or requested_completed_at is null
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or requested_completed_at > statement_timestamp() + interval '5 minutes'
  then
    raise exception using errcode = '22023', message = 'Training finish command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select session.* into stored_session
  from api.training_sessions as session
  where session.user_id = actor_user_id
    and session.operation_id = requested_operation_id;
  if found then
    if stored_session.session_id is distinct from requested_session_id
      or stored_session.completed_at is distinct from requested_completed_at
    then
      raise exception using errcode = '23505', message = 'Training operation identifier was reused with different content.';
    end if;
    return query select stored_session.session_id, stored_session.completed_at,
      stored_session.duration_seconds, false;
    return;
  end if;

  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;
  if stored_run.paused_at is not null then
    raise exception using errcode = '23514', message = 'Resume the training before finishing it.';
  end if;
  if requested_completed_at < stored_run.started_at then
    raise exception using errcode = '22023', message = 'Training completion instant is invalid.';
  end if;

  select count(*)::integer,
    count(*) filter (where item.completed_at is not null)::integer
  into item_total, item_completed
  from api.training_session_run_items as item
  where item.run_id = stored_run.run_id and item.user_id = actor_user_id;
  if item_total < 1 or item_completed <> item_total then
    raise exception using errcode = '23514', message = 'Complete every exercise before finishing the training.';
  end if;

  elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (requested_completed_at - stored_run.started_at)))::integer
      - stored_run.paused_duration_seconds
  );
  select * into completion_result
  from private.complete_training_session(
    requested_session_id,
    actor_user_id,
    requested_operation_id,
    requested_completed_at,
    1,
    requested_event_id,
    requested_correlation_id
  );

  update api.training_sessions as session
  set plan_id = stored_run.plan_id,
    plan_version_id = stored_run.plan_version_id,
    planned_session_id = stored_run.planned_session_id,
    started_at = stored_run.started_at,
    exercise_count = item_total,
    completed_exercise_count = item_completed,
    duration_seconds = elapsed_seconds
  where session.session_id = completion_result.canonical_session_id
    and session.user_id = actor_user_id
  returning session.* into stored_session;

  delete from api.training_session_runs as run
  where run.run_id = stored_run.run_id and run.user_id = actor_user_id;

  return query select stored_session.session_id, stored_session.completed_at,
    stored_session.duration_seconds, completion_result.was_created;
end;
$$;

create function api.start_training_session_at(
  p_planned_session_id uuid,
  p_run_id uuid,
  p_operation_id text,
  p_started_at timestamptz
)
returns table (run_id uuid, planned_session_id uuid, started_at timestamptz, was_created boolean)
language sql security invoker set search_path = '' as $$
  select * from private.start_training_session_at(
    (select auth.uid()), p_planned_session_id, p_run_id, p_operation_id, p_started_at
  );
$$;

create function api.pause_training_session_at(p_run_id uuid, p_paused_at timestamptz)
returns table (run_id uuid, paused_at timestamptz, paused_duration_seconds integer, was_changed boolean)
language sql security invoker set search_path = '' as $$
  select * from private.pause_training_session_at((select auth.uid()), p_run_id, p_paused_at);
$$;

create function api.resume_training_session_at(p_run_id uuid, p_resumed_at timestamptz)
returns table (run_id uuid, paused_at timestamptz, paused_duration_seconds integer, was_changed boolean)
language sql security invoker set search_path = '' as $$
  select * from private.resume_training_session_at((select auth.uid()), p_run_id, p_resumed_at);
$$;

create function api.cancel_training_session_once(p_run_id uuid, p_operation_id text)
returns table (run_id uuid, was_cancelled boolean)
language sql security invoker set search_path = '' as $$
  select * from private.cancel_training_session_once((select auth.uid()), p_run_id, p_operation_id);
$$;

create function api.finish_training_session_at(
  p_run_id uuid,
  p_session_id uuid,
  p_operation_id text,
  p_event_id uuid,
  p_correlation_id uuid,
  p_completed_at timestamptz
)
returns table (session_id uuid, completed_at timestamptz, duration_seconds integer, was_created boolean)
language sql security invoker set search_path = '' as $$
  select * from private.finish_practical_training_session_at(
    (select auth.uid()), p_run_id, p_session_id, p_operation_id,
    p_event_id, p_correlation_id, p_completed_at
  );
$$;

revoke all on function private.start_training_session_at(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.pause_training_session_at(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.resume_training_session_at(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.cancel_training_session_once(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.finish_practical_training_session_at(uuid, uuid, uuid, text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function api.start_training_session_at(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function api.pause_training_session_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function api.resume_training_session_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function api.cancel_training_session_once(uuid, text) from public, anon, authenticated;
revoke all on function api.finish_training_session_at(uuid, uuid, text, uuid, uuid, timestamptz) from public, anon, authenticated;

grant execute on function private.start_training_session_at(uuid, uuid, uuid, text, timestamptz) to authenticated;
grant execute on function private.pause_training_session_at(uuid, uuid, timestamptz) to authenticated;
grant execute on function private.resume_training_session_at(uuid, uuid, timestamptz) to authenticated;
grant execute on function private.cancel_training_session_once(uuid, uuid, text) to authenticated;
grant execute on function private.finish_practical_training_session_at(uuid, uuid, uuid, text, uuid, uuid, timestamptz) to authenticated;
grant execute on function api.start_training_session_at(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function api.pause_training_session_at(uuid, timestamptz) to authenticated;
grant execute on function api.resume_training_session_at(uuid, timestamptz) to authenticated;
grant execute on function api.cancel_training_session_once(uuid, text) to authenticated;
grant execute on function api.finish_training_session_at(uuid, uuid, text, uuid, uuid, timestamptz) to authenticated;

commit;
