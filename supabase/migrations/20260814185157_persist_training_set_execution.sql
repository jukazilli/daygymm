-- US-008A: persist exercise starts and performed sets without replacing the active-run model.
begin;

alter table api.training_plan_items
add column planned_weight_kg numeric(7, 2),
add constraint training_plan_items_planned_weight check (
  planned_weight_kg is null or planned_weight_kg between 0.25 and 2000
);

alter table api.training_session_run_items
add column planned_weight_kg numeric(7, 2),
add column started_at timestamptz,
add constraint training_session_run_items_planned_weight check (
  planned_weight_kg is null or planned_weight_kg between 0.25 and 2000
);

create function private.copy_training_run_item_weight()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select item.planned_weight_kg
  into new.planned_weight_kg
  from api.training_plan_items as item
  where item.item_id = new.plan_item_id
    and item.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function private.copy_training_run_item_weight()
from public, anon, authenticated;

create trigger training_session_run_items_copy_weight
before insert on api.training_session_run_items
for each row
execute function private.copy_training_run_item_weight();

create table api.training_session_run_sets (
  set_execution_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references api.training_session_runs(run_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  operation_id text not null,
  set_number integer not null,
  planned_reps_min integer,
  planned_reps_max integer,
  actual_reps integer,
  planned_weight_kg numeric(7, 2),
  actual_weight_kg numeric(7, 2),
  planned_duration_seconds integer,
  actual_duration_seconds integer,
  planned_distance_meters integer,
  actual_distance_meters integer,
  completed_at timestamptz not null default statement_timestamp(),
  constraint training_session_run_sets_target_unique unique (
    run_id,
    plan_item_id,
    set_number
  ),
  constraint training_session_run_sets_operation_unique unique (
    user_id,
    operation_id
  ),
  constraint training_session_run_sets_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint training_session_run_sets_number check (set_number between 1 and 20),
  constraint training_session_run_sets_reps check (
    (planned_reps_min is null or planned_reps_min between 1 and 1000)
    and (planned_reps_max is null or planned_reps_max between 1 and 1000)
    and (actual_reps is null or actual_reps between 1 and 1000)
    and (
      planned_reps_min is null
      or planned_reps_max is null
      or planned_reps_max >= planned_reps_min
    )
  ),
  constraint training_session_run_sets_weight check (
    (planned_weight_kg is null or planned_weight_kg between 0.25 and 2000)
    and (actual_weight_kg is null or actual_weight_kg between 0.25 and 2000)
  ),
  constraint training_session_run_sets_duration check (
    (planned_duration_seconds is null or planned_duration_seconds between 1 and 7200)
    and (actual_duration_seconds is null or actual_duration_seconds between 1 and 7200)
  ),
  constraint training_session_run_sets_distance check (
    (planned_distance_meters is null or planned_distance_meters between 1 and 100000)
    and (actual_distance_meters is null or actual_distance_meters between 1 and 100000)
  ),
  constraint training_session_run_sets_has_result check (
    actual_reps is not null
    or actual_duration_seconds is not null
    or actual_distance_meters is not null
  )
);

create index training_session_run_sets_user_run_idx
on api.training_session_run_sets (user_id, run_id, plan_item_id, set_number);

create index training_session_run_sets_plan_item_id_idx
on api.training_session_run_sets (plan_item_id);

create table api.training_session_sets (
  set_execution_id uuid primary key,
  session_id uuid not null references api.training_sessions(session_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  exercise_name text not null,
  exercise_order integer not null,
  set_number integer not null,
  planned_reps_min integer,
  planned_reps_max integer,
  actual_reps integer,
  planned_weight_kg numeric(7, 2),
  actual_weight_kg numeric(7, 2),
  planned_duration_seconds integer,
  actual_duration_seconds integer,
  planned_distance_meters integer,
  actual_distance_meters integer,
  completed_at timestamptz not null,
  constraint training_session_sets_target_unique unique (
    session_id,
    plan_item_id,
    set_number
  ),
  constraint training_session_sets_exercise_name check (
    char_length(exercise_name) between 1 and 120
  ),
  constraint training_session_sets_order check (exercise_order between 1 and 100),
  constraint training_session_sets_number check (set_number between 1 and 20),
  constraint training_session_sets_reps check (
    (planned_reps_min is null or planned_reps_min between 1 and 1000)
    and (planned_reps_max is null or planned_reps_max between 1 and 1000)
    and (actual_reps is null or actual_reps between 1 and 1000)
  ),
  constraint training_session_sets_weight check (
    (planned_weight_kg is null or planned_weight_kg between 0.25 and 2000)
    and (actual_weight_kg is null or actual_weight_kg between 0.25 and 2000)
  ),
  constraint training_session_sets_duration check (
    (planned_duration_seconds is null or planned_duration_seconds between 1 and 7200)
    and (actual_duration_seconds is null or actual_duration_seconds between 1 and 7200)
  ),
  constraint training_session_sets_distance check (
    (planned_distance_meters is null or planned_distance_meters between 1 and 100000)
    and (actual_distance_meters is null or actual_distance_meters between 1 and 100000)
  )
);

create index training_session_sets_user_session_idx
on api.training_session_sets (user_id, session_id, exercise_order, set_number);

create index training_session_sets_plan_item_id_idx
on api.training_session_sets (plan_item_id);

comment on table api.training_session_run_sets is
  'Immediately persisted performed sets for one active run; one row per planned set.';
comment on table api.training_session_sets is
  'Canonical performed-set history copied atomically when a training session finishes.';
comment on column api.training_plan_items.planned_weight_kg is
  'Optional planned load; null means absent and is never interpreted as zero.';

alter table api.training_session_run_sets enable row level security;
alter table api.training_session_run_sets force row level security;
alter table api.training_session_sets enable row level security;
alter table api.training_session_sets force row level security;

create policy training_session_run_sets_select_own
on api.training_session_run_sets
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_session_sets_select_own
on api.training_session_sets
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_session_run_sets from public, anon, authenticated;
revoke all on table api.training_session_sets from public, anon, authenticated;
grant select on table api.training_session_run_sets to authenticated;
grant select on table api.training_session_sets to authenticated;

create function private.start_training_exercise(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_plan_item_id uuid
)
returns table (
  exercise_started_at timestamptz,
  next_set_number integer,
  total_sets integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_item api.training_session_run_items%rowtype;
  completed_sets integer;
  created_start boolean := false;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null or requested_plan_item_id is null then
    raise exception using errcode = '22023', message = 'Exercise start command is invalid.';
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

  if stored_item.completed_at is not null then
    raise exception using errcode = '23514', message = 'Exercise is already complete.';
  end if;

  if stored_item.started_at is null then
    update api.training_session_run_items as item
    set started_at = statement_timestamp()
    where item.run_id = requested_run_id
      and item.plan_item_id = requested_plan_item_id
    returning item.* into stored_item;
    created_start := true;
  end if;

  select count(*)::integer
  into completed_sets
  from api.training_session_run_sets as performed
  where performed.run_id = requested_run_id
    and performed.plan_item_id = requested_plan_item_id
    and performed.user_id = actor_user_id;

  update api.training_session_runs as run
  set updated_at = statement_timestamp()
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  return query select
    stored_item.started_at,
    least(stored_item.sets, completed_sets + 1),
    stored_item.sets,
    created_start;
end;
$$;

create function private.complete_training_set(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_plan_item_id uuid,
  requested_set_number integer,
  requested_operation_id text,
  requested_actual_reps integer,
  requested_actual_weight_kg numeric,
  requested_actual_duration_seconds integer,
  requested_actual_distance_meters integer
)
returns table (
  completed_set_execution_id uuid,
  completed_set_number integer,
  exercise_completed boolean,
  completed_set_count integer,
  total_sets integer,
  completed_at timestamptz,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_item api.training_session_run_items%rowtype;
  stored_set api.training_session_run_sets%rowtype;
  current_count integer;
  expected_set integer;
  did_complete_exercise boolean;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null
    or requested_plan_item_id is null
    or requested_set_number not between 1 and 20
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or (requested_actual_reps is null
      and requested_actual_duration_seconds is null
      and requested_actual_distance_meters is null)
    or (requested_actual_reps is not null and requested_actual_reps not between 1 and 1000)
    or (requested_actual_weight_kg is not null and requested_actual_weight_kg not between 0.25 and 2000)
    or (requested_actual_weight_kg is not null and scale(requested_actual_weight_kg) > 2)
    or (requested_actual_duration_seconds is not null and requested_actual_duration_seconds not between 1 and 7200)
    or (requested_actual_distance_meters is not null and requested_actual_distance_meters not between 1 and 100000)
  then
    raise exception using errcode = '22023', message = 'Set completion command is invalid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(requested_run_id::text || ':' || requested_plan_item_id::text, 0)
  );

  select performed.*
  into stored_set
  from api.training_session_run_sets as performed
  where performed.user_id = actor_user_id
    and performed.operation_id = requested_operation_id;

  if found then
    if stored_set.run_id is distinct from requested_run_id
      or stored_set.plan_item_id is distinct from requested_plan_item_id
      or stored_set.set_number is distinct from requested_set_number
      or stored_set.actual_reps is distinct from requested_actual_reps
      or stored_set.actual_weight_kg is distinct from requested_actual_weight_kg
      or stored_set.actual_duration_seconds is distinct from requested_actual_duration_seconds
      or stored_set.actual_distance_meters is distinct from requested_actual_distance_meters
    then
      raise exception using errcode = '23505', message = 'Set operation identifier was reused with different content.';
    end if;

    select item.* into stored_item
    from api.training_session_run_items as item
    where item.run_id = requested_run_id
      and item.plan_item_id = requested_plan_item_id
      and item.user_id = actor_user_id;

    return query select
      stored_set.set_execution_id,
      stored_set.set_number,
      stored_item.completed_at is not null,
      (select count(*)::integer from api.training_session_run_sets as performed
       where performed.run_id = requested_run_id
         and performed.plan_item_id = requested_plan_item_id
         and performed.user_id = actor_user_id),
      stored_item.sets,
      stored_set.completed_at,
      false;
    return;
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

  if stored_item.started_at is null or stored_item.completed_at is not null then
    raise exception using errcode = '23514', message = 'Exercise is not accepting sets.';
  end if;

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

  select count(*)::integer
  into current_count
  from api.training_session_run_sets as performed
  where performed.run_id = requested_run_id
    and performed.plan_item_id = requested_plan_item_id
    and performed.user_id = actor_user_id;

  expected_set := current_count + 1;
  if requested_set_number <> expected_set or requested_set_number > stored_item.sets then
    raise exception using errcode = '23514', message = 'Complete the next pending set.';
  end if;

  insert into api.training_session_run_sets (
    run_id, plan_item_id, user_id, operation_id, set_number,
    planned_reps_min, planned_reps_max, actual_reps,
    planned_weight_kg, actual_weight_kg,
    planned_duration_seconds, actual_duration_seconds,
    planned_distance_meters, actual_distance_meters
  ) values (
    requested_run_id, requested_plan_item_id, actor_user_id,
    requested_operation_id, requested_set_number,
    stored_item.reps_min, stored_item.reps_max, requested_actual_reps,
    stored_item.planned_weight_kg, requested_actual_weight_kg,
    stored_item.duration_seconds, requested_actual_duration_seconds,
    stored_item.distance_meters, requested_actual_distance_meters
  ) returning * into stored_set;

  current_count := current_count + 1;
  did_complete_exercise := current_count = stored_item.sets;

  if did_complete_exercise then
    update api.training_session_run_items as item
    set completed_at = stored_set.completed_at
    where item.run_id = requested_run_id
      and item.plan_item_id = requested_plan_item_id
      and item.user_id = actor_user_id;
  end if;

  update api.training_session_runs as run
  set updated_at = stored_set.completed_at
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  return query select
    stored_set.set_execution_id,
    stored_set.set_number,
    did_complete_exercise,
    current_count,
    stored_item.sets,
    stored_set.completed_at,
    true;
end;
$$;

create function private.import_official_xlsx_plan_with_weights(
  actor_user_id uuid,
  requested_operation_id text,
  requested_source_sha256 text,
  requested_source_file_name text,
  requested_source_size_bytes integer,
  requested_plan_name text,
  requested_sessions jsonb
)
returns table (
  imported_plan_id uuid,
  imported_version_id uuid,
  imported_plan_name text,
  imported_version integer,
  imported_session_count integer,
  imported_item_count integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_value jsonb;
  item_value jsonb;
  sanitized_sessions jsonb;
  import_result record;
  item_weight numeric;
begin
  if jsonb_typeof(requested_sessions) <> 'array' then
    raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
  end if;

  for session_value in select value from jsonb_array_elements(requested_sessions)
  loop
    if jsonb_typeof(session_value) <> 'object'
      or jsonb_typeof(session_value->'items') <> 'array'
    then
      raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
    end if;
    for item_value in select value from jsonb_array_elements(session_value->'items')
    loop
      if jsonb_typeof(item_value) <> 'object' then
        raise exception using errcode = '22023', message = 'Plan items are invalid.';
      end if;
      if item_value ? 'planned_weight_kg'
        and jsonb_typeof(item_value->'planned_weight_kg') not in ('number', 'null')
      then
        raise exception using errcode = '22023', message = 'Planned weight is invalid.';
      end if;
      item_weight := case
        when jsonb_typeof(item_value->'planned_weight_kg') = 'number'
        then (item_value->>'planned_weight_kg')::numeric
      end;
      if item_weight is not null
        and (item_weight not between 0.25 and 2000 or scale(item_weight) > 2)
      then
        raise exception using errcode = '22023', message = 'Planned weight is invalid.';
      end if;
    end loop;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'day_order', session_value->'day_order',
      'name', session_value->'name',
      'items', (
        select jsonb_agg(item_value - 'planned_weight_kg')
        from jsonb_array_elements(session_value->'items') as item(item_value)
      )
    )
  )
  into sanitized_sessions
  from jsonb_array_elements(requested_sessions) as session(session_value);

  select * into import_result
  from private.import_official_xlsx_plan(
    actor_user_id,
    requested_operation_id,
    requested_source_sha256,
    requested_source_file_name,
    requested_source_size_bytes,
    requested_plan_name,
    sanitized_sessions
  );

  if import_result.was_created then
    for session_value in select value from jsonb_array_elements(requested_sessions)
    loop
      for item_value in select value from jsonb_array_elements(session_value->'items')
      loop
        item_weight := case
          when jsonb_typeof(item_value->'planned_weight_kg') = 'number'
          then (item_value->>'planned_weight_kg')::numeric
        end;
        update api.training_plan_items as item
        set planned_weight_kg = item_weight
        from api.training_plan_sessions as planned
        where item.session_id = planned.session_id
          and item.version_id = import_result.imported_version_id
          and planned.day_order = (session_value->>'day_order')::integer
          and item.item_order = (item_value->>'order')::integer;
      end loop;
    end loop;
  end if;

  return query select
    import_result.imported_plan_id,
    import_result.imported_version_id,
    import_result.imported_plan_name,
    import_result.imported_version,
    import_result.imported_session_count,
    import_result.imported_item_count,
    import_result.was_created;
end;
$$;

create or replace function private.finish_practical_training_session(
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
  stored_session api.training_sessions%rowtype;
  finished_at timestamptz := statement_timestamp();
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
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then
    raise exception using errcode = '22023', message = 'Training finish command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select session.* into stored_session
  from api.training_sessions as session
  where session.user_id = actor_user_id
    and session.operation_id = requested_operation_id;

  if found then
    if stored_session.session_id is distinct from requested_session_id then
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

  select count(*)::integer,
    count(*) filter (where item.completed_at is not null)::integer
  into item_total, item_completed
  from api.training_session_run_items as item
  where item.run_id = stored_run.run_id
    and item.user_id = actor_user_id;

  if item_total < 1 or item_completed <> item_total then
    raise exception using errcode = '23514', message = 'Complete every exercise before finishing the training.';
  end if;

  elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (finished_at - stored_run.started_at)))::integer
  );

  select * into completion_result
  from private.complete_training_session(
    requested_session_id, actor_user_id, requested_operation_id, finished_at,
    1, requested_event_id, requested_correlation_id
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
  returning * into stored_session;

  insert into api.training_session_sets (
    set_execution_id, session_id, plan_item_id, user_id,
    exercise_name, exercise_order, set_number,
    planned_reps_min, planned_reps_max, actual_reps,
    planned_weight_kg, actual_weight_kg,
    planned_duration_seconds, actual_duration_seconds,
    planned_distance_meters, actual_distance_meters, completed_at
  )
  select performed.set_execution_id, stored_session.session_id,
    performed.plan_item_id, performed.user_id, item.exercise_name,
    item.item_order, performed.set_number,
    performed.planned_reps_min, performed.planned_reps_max, performed.actual_reps,
    performed.planned_weight_kg, performed.actual_weight_kg,
    performed.planned_duration_seconds, performed.actual_duration_seconds,
    performed.planned_distance_meters, performed.actual_distance_meters,
    performed.completed_at
  from api.training_session_run_sets as performed
  join api.training_session_run_items as item
    on item.run_id = performed.run_id
   and item.plan_item_id = performed.plan_item_id
  where performed.run_id = stored_run.run_id
    and performed.user_id = actor_user_id
  on conflict (set_execution_id) do nothing;

  delete from api.training_session_runs as run
  where run.run_id = stored_run.run_id
    and run.user_id = actor_user_id;

  return query select stored_session.session_id, stored_session.completed_at,
    stored_session.duration_seconds, completion_result.was_created;
end;
$$;

create function api.start_training_exercise(
  p_run_id uuid,
  p_plan_item_id uuid
)
returns table (
  started_at timestamptz,
  next_set_number integer,
  total_sets integer,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.start_training_exercise(
    (select auth.uid()), p_run_id, p_plan_item_id
  );
$$;

create function api.complete_training_set(
  p_run_id uuid,
  p_plan_item_id uuid,
  p_set_number integer,
  p_operation_id text,
  p_actual_reps integer,
  p_actual_weight_kg numeric,
  p_actual_duration_seconds integer,
  p_actual_distance_meters integer
)
returns table (
  set_execution_id uuid,
  set_number integer,
  exercise_completed boolean,
  completed_set_count integer,
  total_sets integer,
  completed_at timestamptz,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.complete_training_set(
    (select auth.uid()), p_run_id, p_plan_item_id, p_set_number,
    p_operation_id, p_actual_reps, p_actual_weight_kg,
    p_actual_duration_seconds, p_actual_distance_meters
  );
$$;

create function api.import_official_xlsx_plan_v2(
  p_operation_id text,
  p_source_sha256 text,
  p_source_file_name text,
  p_source_size_bytes integer,
  p_plan_name text,
  p_sessions jsonb
)
returns table (
  plan_id uuid,
  version_id uuid,
  plan_name text,
  plan_version integer,
  session_count integer,
  item_count integer,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.import_official_xlsx_plan_with_weights(
    (select auth.uid()), p_operation_id, p_source_sha256,
    p_source_file_name, p_source_size_bytes, p_plan_name, p_sessions
  );
$$;

revoke all on function private.start_training_exercise(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function private.complete_training_set(
  uuid, uuid, uuid, integer, text, integer, numeric, integer, integer
) from public, anon, authenticated;
revoke all on function private.import_official_xlsx_plan_with_weights(
  uuid, text, text, text, integer, text, jsonb
) from public, anon, authenticated;
revoke all on function api.start_training_exercise(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.complete_training_set(
  uuid, uuid, integer, text, integer, numeric, integer, integer
) from public, anon, authenticated;
revoke all on function api.import_official_xlsx_plan_v2(
  text, text, text, integer, text, jsonb
) from public, anon, authenticated;

grant execute on function private.start_training_exercise(uuid, uuid, uuid)
to authenticated;
grant execute on function private.complete_training_set(
  uuid, uuid, uuid, integer, text, integer, numeric, integer, integer
) to authenticated;
grant execute on function private.import_official_xlsx_plan_with_weights(
  uuid, text, text, text, integer, text, jsonb
) to authenticated;
grant execute on function api.start_training_exercise(uuid, uuid)
to authenticated;
grant execute on function api.complete_training_set(
  uuid, uuid, integer, text, integer, numeric, integer, integer
) to authenticated;
grant execute on function api.import_official_xlsx_plan_v2(
  text, text, text, integer, text, jsonb
) to authenticated;

commit;
