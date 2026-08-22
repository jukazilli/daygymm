create or replace function private.finish_practical_training_session_at(
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

  insert into api.training_session_sets (
    set_execution_id,
    session_id,
    plan_item_id,
    user_id,
    exercise_name,
    exercise_order,
    set_number,
    planned_reps_min,
    planned_reps_max,
    actual_reps,
    planned_weight_kg,
    actual_weight_kg,
    planned_duration_seconds,
    actual_duration_seconds,
    planned_distance_meters,
    actual_distance_meters,
    completed_at
  )
  select
    performed.set_execution_id,
    stored_session.session_id,
    performed.plan_item_id,
    performed.user_id,
    item.exercise_name,
    item.item_order,
    performed.set_number,
    performed.planned_reps_min,
    performed.planned_reps_max,
    performed.actual_reps,
    performed.planned_weight_kg,
    performed.actual_weight_kg,
    performed.planned_duration_seconds,
    performed.actual_duration_seconds,
    performed.planned_distance_meters,
    performed.actual_distance_meters,
    performed.completed_at
  from api.training_session_run_sets as performed
  join api.training_session_run_items as item
    on item.run_id = performed.run_id
   and item.plan_item_id = performed.plan_item_id
  where performed.run_id = stored_run.run_id
    and performed.user_id = actor_user_id
  on conflict (set_execution_id) do nothing;

  delete from api.training_session_runs as run
  where run.run_id = stored_run.run_id and run.user_id = actor_user_id;

  return query select stored_session.session_id, stored_session.completed_at,
    stored_session.duration_seconds, completion_result.was_created;
end;
$$;

comment on function private.finish_practical_training_session_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz
) is
  'Finishes a replayed training at its client timestamp and copies performed sets before active-run cleanup.';
