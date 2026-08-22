-- Keep a completed session comparable when server timestamps share their
-- finest stored instant with the next run start.
begin;

create or replace function private.get_previous_training_set_references(
  actor_user_id uuid,
  requested_run_id uuid
)
returns table (
  plan_item_id uuid,
  set_number integer,
  source_session_id uuid,
  previous_actual_reps integer,
  previous_actual_weight_kg numeric,
  previous_actual_duration_seconds integer,
  previous_actual_distance_meters integer,
  previous_completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null or not exists (
    select 1
    from api.training_session_runs as run
    where run.run_id = requested_run_id
      and run.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;

  return query
  select
    current_item.plan_item_id,
    set_slot.set_number,
    previous.session_id,
    previous.actual_reps,
    previous.actual_weight_kg,
    previous.actual_duration_seconds,
    previous.actual_distance_meters,
    previous.completed_at
  from api.training_session_run_items as current_item
  cross join lateral generate_series(1, current_item.sets) as set_slot(set_number)
  left join lateral (
    select history.*
    from api.training_session_sets as history
    join api.training_sessions as canonical
      on canonical.session_id = history.session_id
     and canonical.user_id = history.user_id
    join api.training_session_runs as active_run
      on active_run.run_id = current_item.run_id
     and active_run.user_id = current_item.user_id
    where history.user_id = actor_user_id
      and history.set_number = set_slot.set_number
      and canonical.completed_at <= active_run.started_at
      and lower(regexp_replace(trim(history.exercise_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(current_item.exercise_name), '\s+', ' ', 'g'))
      and (history.actual_reps is not null)
        = (current_item.reps_min is not null or current_item.reps_max is not null)
      and (history.actual_duration_seconds is not null)
        = (current_item.duration_seconds is not null)
      and (history.actual_distance_meters is not null)
        = (current_item.distance_meters is not null)
    order by canonical.completed_at desc, history.completed_at desc
    limit 1
  ) as previous on true
  where current_item.run_id = requested_run_id
    and current_item.user_id = actor_user_id
    and previous.set_execution_id is not null
  order by current_item.item_order, set_slot.set_number;
end;
$$;

revoke all on function private.get_previous_training_set_references(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.get_previous_training_set_references(uuid, uuid)
to authenticated;

commit;
