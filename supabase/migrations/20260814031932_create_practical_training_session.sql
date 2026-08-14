-- US-007 / anticipated US-008A: make one imported plan practically executable.
begin;

alter table api.training_sessions
add column plan_id uuid references api.training_plans(plan_id) on delete restrict,
add column plan_version_id uuid references api.training_plan_versions(version_id) on delete restrict,
add column planned_session_id uuid references api.training_plan_sessions(session_id) on delete restrict,
add column started_at timestamptz,
add column exercise_count integer,
add column completed_exercise_count integer,
add column duration_seconds integer,
add constraint training_sessions_practical_context_complete check (
  (
    plan_id is null
    and plan_version_id is null
    and planned_session_id is null
    and started_at is null
    and exercise_count is null
    and completed_exercise_count is null
    and duration_seconds is null
  )
  or (
    plan_id is not null
    and plan_version_id is not null
    and planned_session_id is not null
    and started_at is not null
    and exercise_count between 1 and 100
    and completed_exercise_count = exercise_count
    and duration_seconds >= 0
  )
);

create index training_sessions_user_plan_completed_idx
on api.training_sessions (user_id, plan_version_id, completed_at desc)
where plan_version_id is not null;

create index training_sessions_plan_id_idx
on api.training_sessions (plan_id)
where plan_id is not null;

create index training_sessions_planned_session_id_idx
on api.training_sessions (planned_session_id)
where planned_session_id is not null;

create table api.training_session_runs (
  run_id uuid primary key,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  plan_id uuid not null references api.training_plans(plan_id) on delete restrict,
  plan_version_id uuid not null references api.training_plan_versions(version_id) on delete restrict,
  planned_session_id uuid not null references api.training_plan_sessions(session_id) on delete restrict,
  operation_id text not null,
  started_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint training_session_runs_one_active_per_user unique (user_id),
  constraint training_session_runs_user_operation_unique unique (user_id, operation_id),
  constraint training_session_runs_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  )
);

create index training_session_runs_user_started_idx
on api.training_session_runs (user_id, started_at desc);

create index training_session_runs_plan_id_idx
on api.training_session_runs (plan_id);

create index training_session_runs_plan_version_id_idx
on api.training_session_runs (plan_version_id);

create index training_session_runs_planned_session_id_idx
on api.training_session_runs (planned_session_id);

create table api.training_session_run_items (
  run_id uuid not null references api.training_session_runs(run_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  item_order integer not null,
  exercise_name text not null,
  modality text not null,
  sets integer not null,
  reps_min integer,
  reps_max integer,
  duration_seconds integer,
  distance_meters integer,
  rest_seconds integer not null,
  circuit_group text,
  notes text,
  completed_at timestamptz,
  primary key (run_id, plan_item_id),
  constraint training_session_run_items_order_unique unique (run_id, item_order),
  constraint training_session_run_items_order check (item_order between 1 and 100),
  constraint training_session_run_items_exercise_length check (
    char_length(exercise_name) between 1 and 120
  ),
  constraint training_session_run_items_modality check (
    modality in ('strength', 'time', 'distance', 'cardio', 'circuit')
  ),
  constraint training_session_run_items_sets check (sets between 1 and 20),
  constraint training_session_run_items_reps check (
    (reps_min is null or reps_min between 1 and 1000)
    and (reps_max is null or reps_max between 1 and 1000)
    and (reps_min is null or reps_max is null or reps_max >= reps_min)
  ),
  constraint training_session_run_items_duration check (
    duration_seconds is null or duration_seconds between 1 and 7200
  ),
  constraint training_session_run_items_distance check (
    distance_meters is null or distance_meters between 1 and 100000
  ),
  constraint training_session_run_items_rest check (rest_seconds between 0 and 1800),
  constraint training_session_run_items_circuit_length check (
    circuit_group is null or char_length(circuit_group) between 1 and 40
  ),
  constraint training_session_run_items_notes_length check (
    notes is null or char_length(notes) <= 500
  )
);

create index training_session_run_items_user_run_idx
on api.training_session_run_items (user_id, run_id, item_order);

create index training_session_run_items_plan_item_id_idx
on api.training_session_run_items (plan_item_id);

comment on table api.training_session_runs is
  'One server-persisted active training session per user; offline outbox remains US-009.';
comment on table api.training_session_run_items is
  'Immutable exercise targets copied from the selected plan version for one active run.';
comment on column api.training_sessions.planned_session_id is
  'The immutable planned session completed by this canonical training session.';

alter table api.training_session_runs enable row level security;
alter table api.training_session_runs force row level security;
alter table api.training_session_run_items enable row level security;
alter table api.training_session_run_items force row level security;

create policy training_session_runs_select_own
on api.training_session_runs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_session_run_items_select_own
on api.training_session_run_items
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_session_runs from public, anon, authenticated;
revoke all on table api.training_session_run_items from public, anon, authenticated;
grant select on table api.training_session_runs to authenticated;
grant select on table api.training_session_run_items to authenticated;

create function private.start_training_session(
  actor_user_id uuid,
  requested_planned_session_id uuid,
  requested_run_id uuid,
  requested_operation_id text
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
  stored_run api.training_session_runs%rowtype;
  selected_plan_id uuid;
  selected_version_id uuid;
  copied_items integer;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_planned_session_id is null
    or requested_run_id is null
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then
    raise exception using errcode = '22023', message = 'Training start command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select run.*
  into stored_run
  from api.training_session_runs as run
  where run.user_id = actor_user_id;

  if found then
    return query select
      stored_run.run_id,
      stored_run.planned_session_id,
      stored_run.started_at,
      false;
    return;
  end if;

  select plan.plan_id, version.version_id
  into selected_plan_id, selected_version_id
  from api.training_plan_sessions as planned
  join api.training_plan_versions as version
    on version.version_id = planned.version_id
   and version.user_id = actor_user_id
  join api.training_plans as plan
    on plan.plan_id = version.plan_id
   and plan.user_id = actor_user_id
   and plan.active_version_id = version.version_id
  where planned.session_id = requested_planned_session_id
    and planned.user_id = actor_user_id;

  if not found then
    raise exception using errcode = '23514', message = 'The selected training is not active.';
  end if;

  insert into api.training_session_runs (
    run_id,
    user_id,
    plan_id,
    plan_version_id,
    planned_session_id,
    operation_id
  ) values (
    requested_run_id,
    actor_user_id,
    selected_plan_id,
    selected_version_id,
    requested_planned_session_id,
    requested_operation_id
  )
  returning * into stored_run;

  insert into api.training_session_run_items (
    run_id,
    plan_item_id,
    user_id,
    item_order,
    exercise_name,
    modality,
    sets,
    reps_min,
    reps_max,
    duration_seconds,
    distance_meters,
    rest_seconds,
    circuit_group,
    notes
  )
  select
    stored_run.run_id,
    item.item_id,
    actor_user_id,
    item.item_order,
    item.exercise_name,
    item.modality,
    item.sets,
    item.reps_min,
    item.reps_max,
    item.duration_seconds,
    item.distance_meters,
    item.rest_seconds,
    item.circuit_group,
    item.notes
  from api.training_plan_items as item
  where item.session_id = requested_planned_session_id
    and item.version_id = selected_version_id
    and item.user_id = actor_user_id
  order by item.item_order;

  get diagnostics copied_items = row_count;
  if copied_items not between 1 and 100 then
    raise exception using errcode = '23514', message = 'The selected training has no executable exercises.';
  end if;

  return query select
    stored_run.run_id,
    stored_run.planned_session_id,
    stored_run.started_at,
    true;
end;
$$;

create function private.complete_training_exercise(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_plan_item_id uuid
)
returns table (
  completed_count integer,
  total_count integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_run_id is null or requested_plan_item_id is null then
    raise exception using errcode = '22023', message = 'Exercise completion command is invalid.';
  end if;

  update api.training_session_run_items as item
  set completed_at = statement_timestamp()
  where item.run_id = requested_run_id
    and item.plan_item_id = requested_plan_item_id
    and item.user_id = actor_user_id
    and item.completed_at is null;

  get diagnostics changed_rows = row_count;

  if not exists (
    select 1
    from api.training_session_run_items as item
    where item.run_id = requested_run_id
      and item.plan_item_id = requested_plan_item_id
      and item.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Exercise does not belong to the active training.';
  end if;

  update api.training_session_runs as run
  set updated_at = statement_timestamp()
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  return query
  select
    count(*) filter (where item.completed_at is not null)::integer,
    count(*)::integer,
    changed_rows = 1
  from api.training_session_run_items as item
  where item.run_id = requested_run_id
    and item.user_id = actor_user_id;
end;
$$;

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

  select session.*
  into stored_session
  from api.training_sessions as session
  where session.user_id = actor_user_id
    and session.operation_id = requested_operation_id;

  if found then
    if stored_session.session_id is distinct from requested_session_id then
      raise exception using errcode = '23505', message = 'Training operation identifier was reused with different content.';
    end if;

    return query select
      stored_session.session_id,
      stored_session.completed_at,
      stored_session.duration_seconds,
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

  select
    count(*)::integer,
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

  select *
  into completion_result
  from private.complete_training_session(
    requested_session_id,
    actor_user_id,
    requested_operation_id,
    finished_at,
    1,
    requested_event_id,
    requested_correlation_id
  );

  update api.training_sessions as session
  set
    plan_id = stored_run.plan_id,
    plan_version_id = stored_run.plan_version_id,
    planned_session_id = stored_run.planned_session_id,
    started_at = stored_run.started_at,
    exercise_count = item_total,
    completed_exercise_count = item_completed,
    duration_seconds = elapsed_seconds
  where session.session_id = completion_result.canonical_session_id
    and session.user_id = actor_user_id
  returning * into stored_session;

  delete from api.training_session_runs as run
  where run.run_id = stored_run.run_id
    and run.user_id = actor_user_id;

  return query select
    stored_session.session_id,
    stored_session.completed_at,
    stored_session.duration_seconds,
    completion_result.was_created;
end;
$$;

create function api.start_training_session(
  p_planned_session_id uuid,
  p_run_id uuid,
  p_operation_id text
)
returns table (
  run_id uuid,
  planned_session_id uuid,
  started_at timestamptz,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.start_training_session(
    (select auth.uid()),
    p_planned_session_id,
    p_run_id,
    p_operation_id
  );
$$;

create function api.complete_training_exercise(
  p_run_id uuid,
  p_plan_item_id uuid
)
returns table (
  completed_count integer,
  total_count integer,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.complete_training_exercise(
    (select auth.uid()),
    p_run_id,
    p_plan_item_id
  );
$$;

create function api.finish_training_session(
  p_run_id uuid,
  p_session_id uuid,
  p_operation_id text,
  p_event_id uuid,
  p_correlation_id uuid
)
returns table (
  session_id uuid,
  completed_at timestamptz,
  duration_seconds integer,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.finish_practical_training_session(
    (select auth.uid()),
    p_run_id,
    p_session_id,
    p_operation_id,
    p_event_id,
    p_correlation_id
  );
$$;

revoke all on function private.start_training_session(uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function private.complete_training_exercise(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function private.finish_practical_training_session(
  uuid, uuid, uuid, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function api.start_training_session(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function api.complete_training_exercise(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.finish_training_session(uuid, uuid, text, uuid, uuid)
from public, anon, authenticated;

grant execute on function private.start_training_session(uuid, uuid, uuid, text)
to authenticated;
grant execute on function private.complete_training_exercise(uuid, uuid, uuid)
to authenticated;
grant execute on function private.finish_practical_training_session(
  uuid, uuid, uuid, text, uuid, uuid
) to authenticated;
grant execute on function api.start_training_session(uuid, uuid, text)
to authenticated;
grant execute on function api.complete_training_exercise(uuid, uuid)
to authenticated;
grant execute on function api.finish_training_session(uuid, uuid, text, uuid, uuid)
to authenticated;

commit;
