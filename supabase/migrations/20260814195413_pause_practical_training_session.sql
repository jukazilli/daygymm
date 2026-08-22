-- US-008: pause and resume an active training without losing progress or
-- counting paused time as performed activity.
begin;

alter table api.training_session_runs
add column paused_at timestamptz,
add column paused_duration_seconds integer not null default 0,
add constraint training_session_runs_paused_at_after_start check (
  paused_at is null or paused_at >= started_at
),
add constraint training_session_runs_paused_duration_nonnegative check (
  paused_duration_seconds >= 0
);

comment on column api.training_session_runs.paused_at is
  'When present, the active run is paused and cannot accept performed work.';
comment on column api.training_session_runs.paused_duration_seconds is
  'Accumulated whole seconds excluded from the final performed duration.';

create function private.pause_training_session(
  actor_user_id uuid,
  requested_run_id uuid
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
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null then
    raise exception using errcode = '22023', message = 'Training pause command is invalid.';
  end if;

  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;

  if stored_run.paused_at is null then
    update api.training_session_runs as run
    set paused_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where run.run_id = stored_run.run_id
      and run.user_id = actor_user_id
    returning * into stored_run;

    return query select stored_run.run_id, stored_run.paused_at,
      stored_run.paused_duration_seconds, true;
    return;
  end if;

  return query select stored_run.run_id, stored_run.paused_at,
    stored_run.paused_duration_seconds, false;
end;
$$;

create function private.resume_training_session(
  actor_user_id uuid,
  requested_run_id uuid
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
  resumed_at timestamptz := statement_timestamp();
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null then
    raise exception using errcode = '22023', message = 'Training resume command is invalid.';
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
    update api.training_session_runs as run
    set paused_duration_seconds = run.paused_duration_seconds + greatest(
        0,
        floor(extract(epoch from (resumed_at - run.paused_at)))::integer
      ),
      paused_at = null,
      updated_at = resumed_at
    where run.run_id = stored_run.run_id
      and run.user_id = actor_user_id
    returning * into stored_run;

    return query select stored_run.run_id, stored_run.paused_at,
      stored_run.paused_duration_seconds, true;
    return;
  end if;

  return query select stored_run.run_id, stored_run.paused_at,
    stored_run.paused_duration_seconds, false;
end;
$$;

create function private.reject_paused_training_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_paused_at timestamptz;
begin
  select run.paused_at into active_paused_at
  from api.training_session_runs as run
  where run.run_id = new.run_id
  for update;

  if active_paused_at is not null then
    raise exception using errcode = '23514', message = 'Resume the training before recording progress.';
  end if;

  return new;
end;
$$;

create trigger training_session_run_items_reject_progress_while_paused
before update of started_at, completed_at
on api.training_session_run_items
for each row
when (
  old.started_at is distinct from new.started_at
  or old.completed_at is distinct from new.completed_at
)
execute function private.reject_paused_training_progress();

create trigger training_session_run_sets_reject_insert_while_paused
before insert
on api.training_session_run_sets
for each row
execute function private.reject_paused_training_progress();

alter function private.finish_practical_training_session(
  uuid, uuid, uuid, text, uuid, uuid
) rename to finish_practical_training_session_without_pauses;

revoke all on function private.finish_practical_training_session_without_pauses(
  uuid, uuid, uuid, text, uuid, uuid
) from public, anon, authenticated;

create function private.finish_practical_training_session(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_session_id uuid,
  requested_operation_id text,
  requested_event_id uuid,
  requested_correlation_id uuid
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
  completion_result record;
  adjusted_duration integer;
begin
  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  if found and stored_run.paused_at is not null then
    raise exception using errcode = '23514', message = 'Resume the training before finishing it.';
  end if;

  select * into completion_result
  from private.finish_practical_training_session_without_pauses(
    actor_user_id,
    requested_run_id,
    requested_session_id,
    requested_operation_id,
    requested_event_id,
    requested_correlation_id
  );

  adjusted_duration := greatest(
    0,
    completion_result.canonical_duration_seconds
      - coalesce(stored_run.paused_duration_seconds, 0)
  );

  if completion_result.was_created
    and adjusted_duration is distinct from completion_result.canonical_duration_seconds
  then
    update api.training_sessions as session
    set duration_seconds = adjusted_duration
    where session.session_id = completion_result.canonical_session_id
      and session.user_id = actor_user_id;
  end if;

  return query select
    completion_result.canonical_session_id,
    completion_result.canonical_completed_at,
    adjusted_duration,
    completion_result.was_created;
end;
$$;

create function api.pause_training_session(p_run_id uuid)
returns table (
  run_id uuid,
  paused_at timestamptz,
  paused_duration_seconds integer,
  was_changed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.pause_training_session((select auth.uid()), p_run_id);
$$;

create function api.resume_training_session(p_run_id uuid)
returns table (
  run_id uuid,
  paused_at timestamptz,
  paused_duration_seconds integer,
  was_changed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.resume_training_session((select auth.uid()), p_run_id);
$$;

revoke all on function private.pause_training_session(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.resume_training_session(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.reject_paused_training_progress()
from public, anon, authenticated;
revoke all on function private.finish_practical_training_session(
  uuid, uuid, uuid, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function api.pause_training_session(uuid)
from public, anon, authenticated;
revoke all on function api.resume_training_session(uuid)
from public, anon, authenticated;

grant execute on function private.pause_training_session(uuid, uuid)
to authenticated;
grant execute on function private.resume_training_session(uuid, uuid)
to authenticated;
grant execute on function private.finish_practical_training_session(
  uuid, uuid, uuid, text, uuid, uuid
) to authenticated;
grant execute on function api.pause_training_session(uuid)
to authenticated;
grant execute on function api.resume_training_session(uuid)
to authenticated;

commit;
