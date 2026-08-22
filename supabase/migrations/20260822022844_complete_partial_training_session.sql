-- US-010B: explicit, idempotent partial training completion.
begin;

alter table api.training_sessions
add column completion_status text not null default 'complete',
add column planned_set_count integer,
add column completed_set_count integer,
add constraint training_sessions_completion_status check (
  completion_status in ('complete', 'partial')
);

alter table api.training_sessions
drop constraint training_sessions_practical_context_complete,
add constraint training_sessions_practical_context_complete check (
  (
    plan_id is null
    and plan_version_id is null
    and planned_session_id is null
    and started_at is null
    and exercise_count is null
    and completed_exercise_count is null
    and duration_seconds is null
    and planned_set_count is null
    and completed_set_count is null
    and completion_status = 'complete'
  )
  or (
    plan_id is not null
    and plan_version_id is not null
    and planned_session_id is not null
    and started_at is not null
    and exercise_count between 1 and 100
    and completed_exercise_count between 0 and exercise_count
    and duration_seconds >= 0
    and (
      (
        planned_set_count is null
        and completed_set_count is null
        and completion_status = 'complete'
        and completed_exercise_count = exercise_count
      )
      or (
        planned_set_count between 1 and 2000
        and completed_set_count between 1 and planned_set_count
        and (
          (
            completion_status = 'complete'
            and completed_exercise_count = exercise_count
            and completed_set_count = planned_set_count
          )
          or (
            completion_status = 'partial'
            and completed_set_count < planned_set_count
          )
        )
      )
    )
  )
);

comment on column api.training_sessions.completion_status is
  'Explicit outcome: complete only when all planned sets were confirmed; partial otherwise.';
comment on column api.training_sessions.planned_set_count is
  'Number of sets planned in the immutable run snapshot at completion.';
comment on column api.training_sessions.completed_set_count is
  'Number of sets actually confirmed by the athlete at completion.';

alter table platform.job_outbox
drop constraint job_outbox_event_name,
add constraint job_outbox_event_name check (
  event_name in (
    'TrainingSessionCompleted',
    'TrainingSessionPartiallyCompleted',
    'PlanVersionPublished',
    'ProfessionalAccessRevoked',
    'RewardGranted',
    'ModerationCaseOpened',
    'PartnerOfferChanged'
  )
);

create or replace function private.enqueue_domain_event(event_envelope jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_name_value text;
  event_version_value smallint;
  occurred_at_value timestamptz;
  correlation_id_value uuid;
  producer_value text;
  stored_envelope jsonb;
begin
  if jsonb_typeof(event_envelope) is distinct from 'object'
    or not event_envelope ?& array[
      'event_id', 'event_name', 'event_version', 'occurred_at',
      'correlation_id', 'producer', 'payload'
    ]
    or event_envelope - array[
      'event_id', 'event_name', 'event_version', 'occurred_at',
      'correlation_id', 'producer', 'payload'
    ] <> '{}'::jsonb
    or jsonb_typeof(event_envelope -> 'payload') is distinct from 'object'
  then
    raise exception using errcode = '23514', message = 'Domain event envelope is invalid.';
  end if;

  begin
    event_id_value := (event_envelope ->> 'event_id')::uuid;
    event_name_value := event_envelope ->> 'event_name';
    event_version_value := (event_envelope ->> 'event_version')::smallint;
    occurred_at_value := (event_envelope ->> 'occurred_at')::timestamptz;
    correlation_id_value := (event_envelope ->> 'correlation_id')::uuid;
    producer_value := event_envelope ->> 'producer';
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '23514', message = 'Domain event envelope is invalid.';
  end;

  if event_envelope ->> 'occurred_at' !~ 'Z$' then
    raise exception using errcode = '23514', message = 'Domain event timestamp must use UTC.';
  end if;

  if event_version_value <> 1
    or event_name_value not in (
      'TrainingSessionCompleted',
      'TrainingSessionPartiallyCompleted',
      'PlanVersionPublished',
      'ProfessionalAccessRevoked',
      'RewardGranted',
      'ModerationCaseOpened',
      'PartnerOfferChanged'
    )
    or char_length(producer_value) not between 1 and 80
    or producer_value !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  then
    raise exception using errcode = '23514', message = 'Domain event envelope is invalid.';
  end if;

  insert into platform.job_outbox (
    event_id, event_name, event_version, event_envelope, occurred_at,
    correlation_id, producer
  ) values (
    event_id_value, event_name_value, event_version_value, event_envelope,
    occurred_at_value, correlation_id_value, producer_value
  ) on conflict (event_id) do nothing;

  select outbox.event_envelope into stored_envelope
  from platform.job_outbox as outbox
  where outbox.event_id = event_id_value;

  if stored_envelope is distinct from event_envelope then
    raise exception using errcode = '23505', message = 'Domain event identifier was reused with different content.';
  end if;
  return event_id_value;
end;
$$;

create function private.finish_partial_training_session_at(
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
  canonical_completion_status text,
  canonical_completed_set_count integer,
  canonical_planned_set_count integer,
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
  set_total integer;
  set_completed integer;
  elapsed_seconds integer;
  occurred_at_utc text;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
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
    raise exception using errcode = '22023', message = 'Partial training finish command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select session.* into stored_session
  from api.training_sessions as session
  where session.user_id = actor_user_id
    and session.operation_id = requested_operation_id;
  if found then
    if stored_session.session_id is distinct from requested_session_id
      or stored_session.completed_at is distinct from requested_completed_at
      or stored_session.completion_status <> 'partial'
    then
      raise exception using errcode = '23505', message = 'Training operation identifier was reused with different content.';
    end if;
    return query select stored_session.session_id, stored_session.completed_at,
      stored_session.duration_seconds, stored_session.completion_status,
      stored_session.completed_set_count, stored_session.planned_set_count, false;
    return;
  end if;

  select run.* into stored_run
  from api.training_session_runs as run
  where run.run_id = requested_run_id and run.user_id = actor_user_id
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
    count(*) filter (where item.completed_at is not null)::integer,
    coalesce(sum(item.sets), 0)::integer
  into item_total, item_completed, set_total
  from api.training_session_run_items as item
  where item.run_id = stored_run.run_id and item.user_id = actor_user_id;

  select count(*)::integer into set_completed
  from api.training_session_run_sets as performed
  where performed.run_id = stored_run.run_id and performed.user_id = actor_user_id;

  if item_total < 1 or set_completed < 1 or set_completed >= set_total then
    raise exception using errcode = '23514', message = 'Partial completion requires confirmed and pending sets.';
  end if;

  elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (requested_completed_at - stored_run.started_at)))::integer
      - stored_run.paused_duration_seconds
  );

  insert into api.training_sessions (
    session_id, user_id, operation_id, completed_at, version,
    completion_event_id, plan_id, plan_version_id, planned_session_id,
    started_at, exercise_count, completed_exercise_count, duration_seconds,
    completion_status, planned_set_count, completed_set_count
  ) values (
    requested_session_id, actor_user_id, requested_operation_id,
    requested_completed_at, 1, requested_event_id, stored_run.plan_id,
    stored_run.plan_version_id, stored_run.planned_session_id,
    stored_run.started_at, item_total, item_completed, elapsed_seconds,
    'partial', set_total, set_completed
  ) returning * into stored_session;

  occurred_at_utc := to_char(
    requested_completed_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  perform private.enqueue_domain_event(
    jsonb_build_object(
      'event_id', requested_event_id,
      'event_name', 'TrainingSessionPartiallyCompleted',
      'event_version', 1,
      'occurred_at', occurred_at_utc,
      'correlation_id', requested_correlation_id,
      'producer', 'training',
      'payload', jsonb_build_object(
        'session_id', requested_session_id::text,
        'user_id', actor_user_id::text,
        'occurred_at', occurred_at_utc,
        'version', 1
      )
    )
  );

  insert into api.training_session_sets (
    set_execution_id, session_id, plan_item_id, user_id, exercise_name,
    exercise_order, set_number, planned_reps_min, planned_reps_max,
    actual_reps, planned_weight_kg, actual_weight_kg,
    planned_duration_seconds, actual_duration_seconds,
    planned_distance_meters, actual_distance_meters, completed_at
  )
  select performed.set_execution_id, stored_session.session_id,
    performed.plan_item_id, performed.user_id, item.exercise_name,
    item.item_order, performed.set_number, performed.planned_reps_min,
    performed.planned_reps_max, performed.actual_reps,
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
  where run.run_id = stored_run.run_id and run.user_id = actor_user_id;

  return query select stored_session.session_id, stored_session.completed_at,
    stored_session.duration_seconds, stored_session.completion_status,
    stored_session.completed_set_count, stored_session.planned_set_count, true;
end;
$$;

create function private.finish_training_session_with_status_at(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_session_id uuid,
  requested_operation_id text,
  requested_event_id uuid,
  requested_correlation_id uuid,
  requested_completed_at timestamptz,
  requested_completion_status text
)
returns table (
  canonical_session_id uuid,
  canonical_completed_at timestamptz,
  canonical_duration_seconds integer,
  canonical_completion_status text,
  canonical_completed_set_count integer,
  canonical_planned_set_count integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  completion_result record;
  stored_session api.training_sessions%rowtype;
  set_total integer;
  set_completed integer;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_completion_status = 'partial' then
    return query select * from private.finish_partial_training_session_at(
      actor_user_id, requested_run_id, requested_session_id,
      requested_operation_id, requested_event_id, requested_correlation_id,
      requested_completed_at
    );
    return;
  end if;
  if requested_completion_status <> 'complete' then
    raise exception using errcode = '22023', message = 'Training completion status is invalid.';
  end if;

  select coalesce(sum(item.sets), 0)::integer into set_total
  from api.training_session_run_items as item
  where item.run_id = requested_run_id and item.user_id = actor_user_id;
  select count(*)::integer into set_completed
  from api.training_session_run_sets as performed
  where performed.run_id = requested_run_id and performed.user_id = actor_user_id;

  select * into completion_result
  from private.finish_practical_training_session_at(
    actor_user_id, requested_run_id, requested_session_id,
    requested_operation_id, requested_event_id, requested_correlation_id,
    requested_completed_at
  );

  update api.training_sessions as session
  set completion_status = 'complete',
    planned_set_count = coalesce(session.planned_set_count, set_total),
    completed_set_count = coalesce(session.completed_set_count, set_completed)
  where session.session_id = completion_result.canonical_session_id
    and session.user_id = actor_user_id
  returning session.* into stored_session;

  return query select stored_session.session_id, stored_session.completed_at,
    stored_session.duration_seconds, stored_session.completion_status,
    stored_session.completed_set_count, stored_session.planned_set_count,
    completion_result.was_created;
end;
$$;

create function api.finish_training_session_with_status_at(
  p_run_id uuid,
  p_session_id uuid,
  p_operation_id text,
  p_event_id uuid,
  p_correlation_id uuid,
  p_completed_at timestamptz,
  p_completion_status text
)
returns table (
  session_id uuid,
  completed_at timestamptz,
  duration_seconds integer,
  completion_status text,
  completed_set_count integer,
  planned_set_count integer,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.finish_training_session_with_status_at(
    (select auth.uid()), p_run_id, p_session_id, p_operation_id,
    p_event_id, p_correlation_id, p_completed_at, p_completion_status
  );
$$;

alter table platform.domain_event_receipts
drop constraint domain_event_receipts_event_name,
add constraint domain_event_receipts_event_name check (
  event_name in ('TrainingSessionCompleted', 'TrainingSessionPartiallyCompleted')
);

create function private.handle_training_session_partially_completed(event_envelope jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_version_value smallint;
  occurred_at_value timestamptz;
  session_id_value uuid;
  user_id_value uuid;
  payload_occurred_at_value timestamptz;
  session_version_value integer;
  stored_session api.training_sessions%rowtype;
  inserted_count integer;
begin
  if jsonb_typeof(event_envelope) is distinct from 'object'
    or not event_envelope ?& array[
      'event_id', 'event_name', 'event_version', 'occurred_at',
      'correlation_id', 'producer', 'payload'
    ]
    or event_envelope - array[
      'event_id', 'event_name', 'event_version', 'occurred_at',
      'correlation_id', 'producer', 'payload'
    ] <> '{}'::jsonb
    or jsonb_typeof(event_envelope -> 'payload') is distinct from 'object'
    or not (event_envelope -> 'payload') ?& array[
      'session_id', 'user_id', 'occurred_at', 'version'
    ]
    or (event_envelope -> 'payload') - array[
      'session_id', 'user_id', 'occurred_at', 'version'
    ] <> '{}'::jsonb
  then
    raise exception using errcode = '23514', message = 'Partial training completion event is invalid.';
  end if;

  begin
    event_id_value := (event_envelope ->> 'event_id')::uuid;
    event_version_value := (event_envelope ->> 'event_version')::smallint;
    occurred_at_value := (event_envelope ->> 'occurred_at')::timestamptz;
    session_id_value := (event_envelope #>> '{payload,session_id}')::uuid;
    user_id_value := (event_envelope #>> '{payload,user_id}')::uuid;
    payload_occurred_at_value := (event_envelope #>> '{payload,occurred_at}')::timestamptz;
    session_version_value := (event_envelope #>> '{payload,version}')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '23514', message = 'Partial training completion event is invalid.';
  end;

  if event_envelope ->> 'event_name' <> 'TrainingSessionPartiallyCompleted'
    or event_envelope ->> 'producer' <> 'training'
    or event_version_value <> 1
    or session_version_value < 1
    or event_envelope ->> 'occurred_at' !~ 'Z$'
    or event_envelope #>> '{payload,occurred_at}' !~ 'Z$'
    or occurred_at_value is distinct from payload_occurred_at_value
  then
    raise exception using errcode = '23514', message = 'Partial training completion event is invalid.';
  end if;

  select session.* into stored_session
  from api.training_sessions as session
  where session.session_id = session_id_value
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'Partial training completion source was not found.';
  end if;

  if stored_session.user_id is distinct from user_id_value
    or stored_session.completed_at is distinct from payload_occurred_at_value
    or stored_session.version is distinct from session_version_value
    or stored_session.completion_event_id is distinct from event_id_value
    or stored_session.completion_status <> 'partial'
  then
    raise exception using errcode = '23514', message = 'Partial training completion event does not match canonical state.';
  end if;

  insert into platform.domain_event_receipts (
    consumer_name, event_id, event_name, event_version, occurred_at
  ) values (
    'training.partial-completion.v1', event_id_value,
    'TrainingSessionPartiallyCompleted', event_version_value, occurred_at_value
  ) on conflict (consumer_name, event_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    if stored_session.completion_consumed_at is null then
      raise exception using errcode = '23514', message = 'Partial training completion receipt is inconsistent.';
    end if;
    return 'already-processed';
  end if;

  update api.training_sessions
  set completion_consumed_at = statement_timestamp()
  where session_id = session_id_value and completion_consumed_at is null;
  return 'processed';
end;
$$;

create or replace function private.worker_handle_domain_event(event_envelope jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if event_envelope ->> 'event_name' = 'TrainingSessionCompleted' then
    return private.handle_training_session_completed(event_envelope);
  end if;
  if event_envelope ->> 'event_name' = 'TrainingSessionPartiallyCompleted' then
    return private.handle_training_session_partially_completed(event_envelope);
  end if;
  raise exception using errcode = '0A000', message = 'Domain event handler is unavailable.';
end;
$$;

comment on function private.finish_partial_training_session_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz
) is 'Persists only confirmed sets when an athlete explicitly finishes a training partially.';
comment on function private.finish_training_session_with_status_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, text
) is 'Routes an idempotent training finish to complete or partial canonical semantics.';
comment on function private.handle_training_session_partially_completed(jsonb) is
  'Validates partial canonical state and records a bounded durable receipt without complete-only side effects.';

revoke all on function private.enqueue_domain_event(jsonb)
from public, anon, authenticated;
revoke all on function private.finish_partial_training_session_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function private.finish_training_session_with_status_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
revoke all on function api.finish_training_session_with_status_at(
  uuid, uuid, text, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
revoke all on function private.handle_training_session_partially_completed(jsonb)
from public, anon, authenticated, daygym_worker, daygym_worker_runtime;
revoke all on function private.worker_handle_domain_event(jsonb)
from public, anon, authenticated;

grant execute on function private.finish_partial_training_session_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz
) to authenticated;
grant execute on function private.finish_training_session_with_status_at(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, text
) to authenticated;
grant execute on function api.finish_training_session_with_status_at(
  uuid, uuid, text, uuid, uuid, timestamptz, text
) to authenticated;
grant execute on function private.worker_handle_domain_event(jsonb)
to daygym_worker;

commit;
