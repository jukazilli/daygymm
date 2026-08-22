-- US-008B: previous comparable-set reference and audited correction/undo.
begin;

alter table api.training_session_run_sets
add column revision integer not null default 1,
add column updated_at timestamptz not null default statement_timestamp(),
add constraint training_session_run_sets_revision_positive check (
  revision between 1 and 1000
),
add constraint training_session_run_sets_updated_after_completion check (
  updated_at >= completed_at
);

alter table api.training_session_sets
add column revision integer not null default 1,
add column updated_at timestamptz not null default statement_timestamp(),
add constraint training_session_sets_revision_positive check (
  revision between 1 and 1000
),
add constraint training_session_sets_updated_after_completion check (
  updated_at >= completed_at
);

create table api.training_session_run_set_adjustments (
  adjustment_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references api.training_session_runs(run_id) on delete cascade,
  set_execution_id uuid not null,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  operation_id text not null,
  action text not null,
  set_number integer not null,
  expected_revision integer not null,
  resulting_revision integer,
  before_values jsonb not null,
  after_values jsonb,
  completed_set_count integer not null,
  total_sets integer not null,
  exercise_completed boolean not null,
  changed_at timestamptz not null default statement_timestamp(),
  was_changed boolean not null,
  constraint training_session_run_set_adjustments_operation_unique unique (
    user_id,
    operation_id
  ),
  constraint training_session_run_set_adjustments_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint training_session_run_set_adjustments_action check (
    action in ('correct', 'undo')
  ),
  constraint training_session_run_set_adjustments_number check (
    set_number between 1 and 20
  ),
  constraint training_session_run_set_adjustments_revision check (
    expected_revision between 1 and 1000
    and (
      (action = 'correct' and resulting_revision between 1 and 1000)
      or (action = 'undo' and resulting_revision is null)
    )
  ),
  constraint training_session_run_set_adjustments_values check (
    jsonb_typeof(before_values) = 'object'
    and (
      (action = 'correct' and jsonb_typeof(after_values) = 'object')
      or (action = 'undo' and after_values is null)
    )
  ),
  constraint training_session_run_set_adjustments_counts check (
    completed_set_count between 0 and 20
    and total_sets between 1 and 20
    and completed_set_count <= total_sets
  )
);

create index training_session_run_set_adjustments_run_idx
on api.training_session_run_set_adjustments (
  user_id,
  run_id,
  plan_item_id,
  changed_at
);

create index training_session_run_set_adjustments_set_idx
on api.training_session_run_set_adjustments (set_execution_id, changed_at);

create table api.training_session_set_adjustments (
  adjustment_id uuid primary key,
  session_id uuid not null references api.training_sessions(session_id) on delete cascade,
  set_execution_id uuid not null references api.training_session_sets(set_execution_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  operation_id text not null,
  set_number integer not null,
  expected_revision integer not null,
  resulting_revision integer not null,
  before_values jsonb not null,
  after_values jsonb not null,
  changed_at timestamptz not null,
  was_changed boolean not null,
  constraint training_session_set_adjustments_operation_unique unique (
    user_id,
    operation_id
  ),
  constraint training_session_set_adjustments_number check (
    set_number between 1 and 20
  ),
  constraint training_session_set_adjustments_revision check (
    expected_revision between 1 and 1000
    and resulting_revision between 1 and 1000
  ),
  constraint training_session_set_adjustments_values check (
    jsonb_typeof(before_values) = 'object'
    and jsonb_typeof(after_values) = 'object'
  )
);

create index training_session_set_adjustments_session_idx
on api.training_session_set_adjustments (
  user_id,
  session_id,
  set_execution_id,
  changed_at
);

comment on table api.training_session_run_set_adjustments is
  'Audited corrections and undo operations retained while the run is active.';
comment on table api.training_session_set_adjustments is
  'Canonical audit trail for corrected sets that survive a finished session.';
comment on column api.training_session_run_sets.revision is
  'Optimistic-concurrency revision incremented by each effective correction.';

alter table api.training_session_run_set_adjustments enable row level security;
alter table api.training_session_run_set_adjustments force row level security;
alter table api.training_session_set_adjustments enable row level security;
alter table api.training_session_set_adjustments force row level security;

create policy training_session_run_set_adjustments_select_own
on api.training_session_run_set_adjustments
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_session_set_adjustments_select_own
on api.training_session_set_adjustments
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_session_run_set_adjustments
from public, anon, authenticated;
revoke all on table api.training_session_set_adjustments
from public, anon, authenticated;
grant select on table api.training_session_run_set_adjustments to authenticated;
grant select on table api.training_session_set_adjustments to authenticated;

create function private.copy_training_set_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select performed.revision, performed.updated_at
  into new.revision, new.updated_at
  from api.training_session_run_sets as performed
  where performed.set_execution_id = new.set_execution_id
    and performed.user_id = new.user_id;

  if not found then
    raise exception using errcode = '23514', message = 'Active set revision was not found.';
  end if;

  return new;
end;
$$;

create function private.copy_training_set_adjustments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into api.training_session_set_adjustments (
    adjustment_id,
    session_id,
    set_execution_id,
    plan_item_id,
    user_id,
    operation_id,
    set_number,
    expected_revision,
    resulting_revision,
    before_values,
    after_values,
    changed_at,
    was_changed
  )
  select
    adjustment.adjustment_id,
    new.session_id,
    adjustment.set_execution_id,
    adjustment.plan_item_id,
    adjustment.user_id,
    adjustment.operation_id,
    adjustment.set_number,
    adjustment.expected_revision,
    adjustment.resulting_revision,
    adjustment.before_values,
    adjustment.after_values,
    adjustment.changed_at,
    adjustment.was_changed
  from api.training_session_run_set_adjustments as adjustment
  where adjustment.run_id = (
      select performed.run_id
      from api.training_session_run_sets as performed
      where performed.set_execution_id = new.set_execution_id
        and performed.user_id = new.user_id
    )
    and adjustment.set_execution_id = new.set_execution_id
    and adjustment.user_id = new.user_id
    and adjustment.action = 'correct'
  on conflict (adjustment_id) do nothing;

  return new;
end;
$$;

revoke all on function private.copy_training_set_revision()
from public, anon, authenticated;
revoke all on function private.copy_training_set_adjustments()
from public, anon, authenticated;

create trigger training_session_sets_copy_revision
before insert on api.training_session_sets
for each row
execute function private.copy_training_set_revision();

create trigger training_session_sets_copy_adjustments
after insert on api.training_session_sets
for each row
execute function private.copy_training_set_adjustments();

create function private.get_previous_training_set_references(
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
      and canonical.completed_at < active_run.started_at
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

create function private.revise_training_set(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_plan_item_id uuid,
  requested_set_execution_id uuid,
  requested_set_number integer,
  requested_action text,
  requested_expected_revision integer,
  requested_operation_id text,
  requested_actual_reps integer,
  requested_actual_weight_kg numeric,
  requested_actual_duration_seconds integer,
  requested_actual_distance_meters integer
)
returns table (
  revised_set_execution_id uuid,
  revised_set_number integer,
  revision_action text,
  resulting_revision integer,
  exercise_completed boolean,
  completed_set_count integer,
  total_sets integer,
  changed_at timestamptz,
  was_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_run api.training_session_runs%rowtype;
  stored_item api.training_session_run_items%rowtype;
  stored_set api.training_session_run_sets%rowtype;
  stored_adjustment api.training_session_run_set_adjustments%rowtype;
  previous_values jsonb;
  requested_values jsonb;
  remaining_count integer;
  latest_set_number integer;
  next_revision integer;
  changed_in_command boolean;
  changed_instant timestamptz := statement_timestamp();
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null
    or requested_plan_item_id is null
    or requested_set_execution_id is null
    or requested_set_number is null
    or requested_set_number not between 1 and 20
    or requested_action is null
    or requested_action not in ('correct', 'undo')
    or requested_expected_revision is null
    or requested_expected_revision not between 1 and 1000
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or (
      requested_action = 'correct'
      and (
        (requested_actual_reps is null
          and requested_actual_duration_seconds is null
          and requested_actual_distance_meters is null)
        or (requested_actual_reps is not null and requested_actual_reps not between 1 and 1000)
        or (requested_actual_weight_kg is not null and requested_actual_weight_kg not between 0.25 and 2000)
        or (requested_actual_weight_kg is not null and scale(requested_actual_weight_kg) > 2)
        or (requested_actual_duration_seconds is not null and requested_actual_duration_seconds not between 1 and 7200)
        or (requested_actual_distance_meters is not null and requested_actual_distance_meters not between 1 and 100000)
      )
    )
    or (
      requested_action = 'undo'
      and (
        requested_actual_reps is not null
        or requested_actual_weight_kg is not null
        or requested_actual_duration_seconds is not null
        or requested_actual_distance_meters is not null
      )
    )
  then
    raise exception using errcode = '22023', message = 'Set revision command is invalid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(requested_run_id::text || ':' || requested_plan_item_id::text, 0)
  );

  requested_values := case
    when requested_action = 'correct' then jsonb_build_object(
      'actual_reps', requested_actual_reps,
      'actual_weight_kg', requested_actual_weight_kg,
      'actual_duration_seconds', requested_actual_duration_seconds,
      'actual_distance_meters', requested_actual_distance_meters
    )
  end;

  select adjustment.*
  into stored_adjustment
  from api.training_session_run_set_adjustments as adjustment
  where adjustment.user_id = actor_user_id
    and adjustment.operation_id = requested_operation_id;

  if found then
    if stored_adjustment.run_id is distinct from requested_run_id
      or stored_adjustment.plan_item_id is distinct from requested_plan_item_id
      or stored_adjustment.set_execution_id is distinct from requested_set_execution_id
      or stored_adjustment.set_number is distinct from requested_set_number
      or stored_adjustment.action is distinct from requested_action
      or stored_adjustment.expected_revision is distinct from requested_expected_revision
      or stored_adjustment.after_values is distinct from requested_values
    then
      raise exception using errcode = '23505', message = 'Set revision operation identifier was reused with different content.';
    end if;

    return query select
      stored_adjustment.set_execution_id,
      stored_adjustment.set_number,
      stored_adjustment.action,
      stored_adjustment.resulting_revision,
      stored_adjustment.exercise_completed,
      stored_adjustment.completed_set_count,
      stored_adjustment.total_sets,
      stored_adjustment.changed_at,
      false;
    return;
  end if;

  select run.*
  into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;

  if stored_run.paused_at is not null then
    raise exception using errcode = '23514', message = 'Resume the training before changing a set.';
  end if;

  select item.*
  into stored_item
  from api.training_session_run_items as item
  where item.run_id = requested_run_id
    and item.plan_item_id = requested_plan_item_id
    and item.user_id = actor_user_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'Exercise does not belong to the active training.';
  end if;

  select performed.*
  into stored_set
  from api.training_session_run_sets as performed
  where performed.set_execution_id = requested_set_execution_id
    and performed.run_id = requested_run_id
    and performed.plan_item_id = requested_plan_item_id
    and performed.user_id = actor_user_id
    and performed.set_number = requested_set_number
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'Completed set was not found.';
  end if;

  if stored_set.revision is distinct from requested_expected_revision then
    raise exception using errcode = '40001', message = 'Completed set changed. Reload it before trying again.';
  end if;

  previous_values := jsonb_build_object(
    'actual_reps', stored_set.actual_reps,
    'actual_weight_kg', stored_set.actual_weight_kg,
    'actual_duration_seconds', stored_set.actual_duration_seconds,
    'actual_distance_meters', stored_set.actual_distance_meters
  );

  if requested_action = 'correct' then
    if (
        (stored_item.reps_min is not null or stored_item.reps_max is not null)
        and requested_actual_reps is null
      ) or (
        stored_item.duration_seconds is not null
        and requested_actual_duration_seconds is null
      ) or (
        stored_item.distance_meters is not null
        and requested_actual_distance_meters is null
      )
    then
      raise exception using errcode = '22023', message = 'Performed values do not match the planned exercise.';
    end if;

    changed_in_command := previous_values is distinct from requested_values;
    next_revision := stored_set.revision + case when changed_in_command then 1 else 0 end;

    if next_revision > 1000 then
      raise exception using errcode = '23514', message = 'Completed set reached its revision limit.';
    end if;

    if changed_in_command then
      update api.training_session_run_sets as performed
      set actual_reps = requested_actual_reps,
        actual_weight_kg = requested_actual_weight_kg,
        actual_duration_seconds = requested_actual_duration_seconds,
        actual_distance_meters = requested_actual_distance_meters,
        revision = next_revision,
        updated_at = changed_instant
      where performed.set_execution_id = stored_set.set_execution_id;
    end if;

    select count(*)::integer
    into remaining_count
    from api.training_session_run_sets as performed
    where performed.run_id = requested_run_id
      and performed.plan_item_id = requested_plan_item_id
      and performed.user_id = actor_user_id;
  else
    select max(performed.set_number)
    into latest_set_number
    from api.training_session_run_sets as performed
    where performed.run_id = requested_run_id
      and performed.plan_item_id = requested_plan_item_id
      and performed.user_id = actor_user_id;

    if latest_set_number is distinct from requested_set_number then
      raise exception using errcode = '23514', message = 'Only the latest completed set can be undone.';
    end if;

    delete from api.training_session_run_sets as performed
    where performed.set_execution_id = stored_set.set_execution_id;

    update api.training_session_run_items as item
    set completed_at = null
    where item.run_id = requested_run_id
      and item.plan_item_id = requested_plan_item_id
      and item.user_id = actor_user_id
      and item.completed_at is not null;

    select count(*)::integer
    into remaining_count
    from api.training_session_run_sets as performed
    where performed.run_id = requested_run_id
      and performed.plan_item_id = requested_plan_item_id
      and performed.user_id = actor_user_id;

    next_revision := null;
    changed_in_command := true;
  end if;

  insert into api.training_session_run_set_adjustments (
    run_id,
    set_execution_id,
    plan_item_id,
    user_id,
    operation_id,
    action,
    set_number,
    expected_revision,
    resulting_revision,
    before_values,
    after_values,
    completed_set_count,
    total_sets,
    exercise_completed,
    changed_at,
    was_changed
  ) values (
    requested_run_id,
    requested_set_execution_id,
    requested_plan_item_id,
    actor_user_id,
    requested_operation_id,
    requested_action,
    requested_set_number,
    requested_expected_revision,
    next_revision,
    previous_values,
    requested_values,
    remaining_count,
    stored_item.sets,
    requested_action = 'correct' and stored_item.completed_at is not null,
    changed_instant,
    changed_in_command
  ) returning * into stored_adjustment;

  update api.training_session_runs as run
  set updated_at = changed_instant
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  return query select
    stored_adjustment.set_execution_id,
    stored_adjustment.set_number,
    stored_adjustment.action,
    stored_adjustment.resulting_revision,
    stored_adjustment.exercise_completed,
    stored_adjustment.completed_set_count,
    stored_adjustment.total_sets,
    stored_adjustment.changed_at,
    stored_adjustment.was_changed;
end;
$$;

create function api.get_previous_training_set_references(p_run_id uuid)
returns table (
  plan_item_id uuid,
  set_number integer,
  source_session_id uuid,
  actual_reps integer,
  actual_weight_kg numeric,
  actual_duration_seconds integer,
  actual_distance_meters integer,
  completed_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_previous_training_set_references(
    (select auth.uid()),
    p_run_id
  );
$$;

create function api.revise_training_set(
  p_run_id uuid,
  p_plan_item_id uuid,
  p_set_execution_id uuid,
  p_set_number integer,
  p_action text,
  p_expected_revision integer,
  p_operation_id text,
  p_actual_reps integer,
  p_actual_weight_kg numeric,
  p_actual_duration_seconds integer,
  p_actual_distance_meters integer
)
returns table (
  set_execution_id uuid,
  set_number integer,
  action text,
  revision integer,
  exercise_completed boolean,
  completed_set_count integer,
  total_sets integer,
  changed_at timestamptz,
  was_changed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.revise_training_set(
    (select auth.uid()),
    p_run_id,
    p_plan_item_id,
    p_set_execution_id,
    p_set_number,
    p_action,
    p_expected_revision,
    p_operation_id,
    p_actual_reps,
    p_actual_weight_kg,
    p_actual_duration_seconds,
    p_actual_distance_meters
  );
$$;

revoke all on function private.get_previous_training_set_references(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.revise_training_set(
  uuid, uuid, uuid, uuid, integer, text, integer, text,
  integer, numeric, integer, integer
) from public, anon, authenticated;
revoke all on function api.get_previous_training_set_references(uuid)
from public, anon, authenticated;
revoke all on function api.revise_training_set(
  uuid, uuid, uuid, integer, text, integer, text,
  integer, numeric, integer, integer
) from public, anon, authenticated;

grant execute on function private.get_previous_training_set_references(uuid, uuid)
to authenticated;
grant execute on function private.revise_training_set(
  uuid, uuid, uuid, uuid, integer, text, integer, text,
  integer, numeric, integer, integer
) to authenticated;
grant execute on function api.get_previous_training_set_references(uuid)
to authenticated;
grant execute on function api.revise_training_set(
  uuid, uuid, uuid, integer, text, integer, text,
  integer, numeric, integer, integer
) to authenticated;

commit;
