-- US-010C: approved, auditable exercise substitutions.
begin;

create table api.training_plan_item_alternatives (
  alternative_id uuid primary key,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete cascade,
  version_id uuid not null references api.training_plan_versions(version_id) on delete cascade,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  alternative_order integer not null,
  exercise_name text not null,
  constraint training_plan_item_alternatives_order check (alternative_order between 1 and 5),
  constraint training_plan_item_alternatives_name check (
    char_length(btrim(exercise_name)) between 1 and 120
  ),
  constraint training_plan_item_alternatives_order_unique unique (
    plan_item_id, alternative_order
  )
);

create unique index training_plan_item_alternatives_name_unique
on api.training_plan_item_alternatives (plan_item_id, lower(btrim(exercise_name)));

create index training_plan_item_alternatives_user_version_idx
on api.training_plan_item_alternatives (user_id, version_id, plan_item_id);

alter table api.training_plan_item_alternatives enable row level security;
alter table api.training_plan_item_alternatives force row level security;

create policy training_plan_item_alternatives_select_own
on api.training_plan_item_alternatives
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_plan_item_alternatives
from public, anon, authenticated;
grant select on table api.training_plan_item_alternatives to authenticated;

create table api.training_session_run_item_substitutions (
  run_id uuid not null references api.training_session_runs(run_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  alternative_id uuid not null references api.training_plan_item_alternatives(alternative_id) on delete restrict,
  operation_id text not null,
  reason text not null,
  planned_exercise_name text not null,
  executed_exercise_name text not null,
  substituted_at timestamptz not null,
  primary key (run_id, plan_item_id),
  constraint training_session_run_substitutions_operation_unique unique (user_id, operation_id),
  constraint training_session_run_substitutions_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint training_session_run_substitutions_reason check (
    reason in ('equipment_unavailable', 'comfort', 'preference', 'other')
  ),
  constraint training_session_run_substitutions_names check (
    char_length(planned_exercise_name) between 1 and 120
    and char_length(executed_exercise_name) between 1 and 120
  )
);

create index training_session_run_substitutions_user_run_idx
on api.training_session_run_item_substitutions (user_id, run_id);

alter table api.training_session_run_item_substitutions enable row level security;
alter table api.training_session_run_item_substitutions force row level security;

create policy training_session_run_substitutions_select_own
on api.training_session_run_item_substitutions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_session_run_item_substitutions
from public, anon, authenticated;
grant select on table api.training_session_run_item_substitutions to authenticated;

create table api.training_session_substitutions (
  session_id uuid not null references api.training_sessions(session_id) on delete cascade,
  plan_item_id uuid not null references api.training_plan_items(item_id) on delete restrict,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  alternative_id uuid not null references api.training_plan_item_alternatives(alternative_id) on delete restrict,
  reason text not null,
  planned_exercise_name text not null,
  executed_exercise_name text not null,
  substituted_at timestamptz not null,
  primary key (session_id, plan_item_id),
  constraint training_session_substitutions_reason check (
    reason in ('equipment_unavailable', 'comfort', 'preference', 'other')
  ),
  constraint training_session_substitutions_names check (
    char_length(planned_exercise_name) between 1 and 120
    and char_length(executed_exercise_name) between 1 and 120
  )
);

create index training_session_substitutions_user_session_idx
on api.training_session_substitutions (user_id, session_id);

alter table api.training_session_substitutions enable row level security;
alter table api.training_session_substitutions force row level security;

create policy training_session_substitutions_select_own
on api.training_session_substitutions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_session_substitutions
from public, anon, authenticated;
grant select on table api.training_session_substitutions to authenticated;

alter table api.training_session_sets
add column planned_exercise_name text;

update api.training_session_sets
set planned_exercise_name = exercise_name;

alter table api.training_session_sets
alter column planned_exercise_name set not null,
add constraint training_session_sets_planned_exercise_name check (
  char_length(planned_exercise_name) between 1 and 120
);

create function private.publish_training_plan_version_v3(
  actor_user_id uuid,
  requested_plan_id uuid,
  requested_operation_id text,
  requested_content_sha256 text,
  requested_plan_name text,
  requested_change_summary text,
  requested_sessions jsonb
)
returns table (
  published_plan_id uuid,
  published_version_id uuid,
  published_plan_name text,
  published_version integer,
  published_session_count integer,
  published_item_count integer,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session jsonb;
  current_item jsonb;
  current_alternative jsonb;
  sanitized_sessions jsonb;
  publication record;
  stored_item_id uuid;
begin
  if jsonb_typeof(requested_sessions) <> 'array' then
    raise exception using errcode = '22023', message = 'Plan publication command is invalid.';
  end if;

  for current_session in
    select session_entry.value
    from jsonb_array_elements(requested_sessions) as session_entry(value)
  loop
    if jsonb_typeof(current_session->'items') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    for current_item in
      select item_entry.value
      from jsonb_array_elements(current_session->'items') as item_entry(value)
    loop
      if jsonb_typeof(current_item->'alternatives') is distinct from 'array'
        or jsonb_array_length(current_item->'alternatives') > 5
        or (
          select count(*) <> count(distinct lower(btrim(entry.value->>'exercise_name')))
          from jsonb_array_elements(current_item->'alternatives') as entry(value)
        )
      then
        raise exception using errcode = '22023', message = 'Approved alternatives are invalid.';
      end if;

      for current_alternative in
        select alternative_entry.value
        from jsonb_array_elements(current_item->'alternatives') as alternative_entry(value)
      loop
        if jsonb_typeof(current_alternative) is distinct from 'object'
          or jsonb_typeof(current_alternative->'alternative_id') is distinct from 'string'
          or (current_alternative->>'alternative_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or jsonb_typeof(current_alternative->'exercise_name') is distinct from 'string'
          or char_length(btrim(current_alternative->>'exercise_name')) not between 1 and 120
          or lower(btrim(current_alternative->>'exercise_name')) = lower(btrim(current_item->>'exercise_name'))
          or jsonb_typeof(current_alternative->'order') is distinct from 'number'
          or (current_alternative->>'order') !~ '^[1-5]$'
        then
          raise exception using errcode = '22023', message = 'Approved alternative is invalid.';
        end if;
      end loop;
    end loop;
  end loop;

  select jsonb_agg(
    session_entry.value || jsonb_build_object(
      'items',
      (
        select jsonb_agg(item_entry.value - 'alternatives' order by item_entry.ordinality)
        from jsonb_array_elements(session_entry.value->'items')
          with ordinality as item_entry(value, ordinality)
      )
    )
    order by session_entry.ordinality
  )
  into sanitized_sessions
  from jsonb_array_elements(requested_sessions)
    with ordinality as session_entry(value, ordinality);

  select *
  into publication
  from private.publish_training_plan_version_v2(
    actor_user_id,
    requested_plan_id,
    requested_operation_id,
    requested_content_sha256,
    requested_plan_name,
    requested_change_summary,
    sanitized_sessions
  );

  if publication.was_created then
    for current_session in
      select session_entry.value
      from jsonb_array_elements(requested_sessions) as session_entry(value)
    loop
      for current_item in
        select item_entry.value
        from jsonb_array_elements(current_session->'items') as item_entry(value)
      loop
        select item.item_id
        into stored_item_id
        from api.training_plan_items as item
        join api.training_plan_sessions as session
          on session.session_id = item.session_id
         and session.version_id = item.version_id
         and session.user_id = item.user_id
        where item.version_id = publication.published_version_id
          and item.user_id = actor_user_id
          and session.day_order = (current_session->>'day_order')::integer
          and item.item_order = (current_item->>'order')::integer;

        for current_alternative in
          select alternative_entry.value
          from jsonb_array_elements(current_item->'alternatives') as alternative_entry(value)
        loop
          insert into api.training_plan_item_alternatives (
            alternative_id,
            plan_item_id,
            version_id,
            user_id,
            alternative_order,
            exercise_name
          ) values (
            (current_alternative->>'alternative_id')::uuid,
            stored_item_id,
            publication.published_version_id,
            actor_user_id,
            (current_alternative->>'order')::integer,
            btrim(current_alternative->>'exercise_name')
          );
        end loop;
      end loop;
    end loop;
  end if;

  return query select
    publication.published_plan_id,
    publication.published_version_id,
    publication.published_plan_name,
    publication.published_version,
    publication.published_session_count,
    publication.published_item_count,
    publication.was_created;
end;
$$;

create function api.publish_training_plan_version_v3(
  p_plan_id uuid,
  p_operation_id text,
  p_content_sha256 text,
  p_plan_name text,
  p_change_summary text,
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
  select * from private.publish_training_plan_version_v3(
    (select auth.uid()), p_plan_id, p_operation_id, p_content_sha256,
    p_plan_name, p_change_summary, p_sessions
  );
$$;

create function private.substitute_training_exercise(
  actor_user_id uuid,
  requested_run_id uuid,
  requested_plan_item_id uuid,
  requested_alternative_id uuid,
  requested_reason text,
  requested_substituted_at timestamptz,
  requested_operation_id text
)
returns table (
  alternative_id uuid,
  planned_exercise_name text,
  exercise_name text,
  reason text,
  substituted_at timestamptz,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_item api.training_session_run_items%rowtype;
  alternative api.training_plan_item_alternatives%rowtype;
  stored api.training_session_run_item_substitutions%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_run_id is null
    or requested_plan_item_id is null
    or requested_alternative_id is null
    or requested_substituted_at is null
    or requested_substituted_at > statement_timestamp() + interval '5 minutes'
    or requested_reason is null
    or requested_reason not in ('equipment_unavailable', 'comfort', 'preference', 'other')
    or requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then
    raise exception using errcode = '22023', message = 'Exercise substitution command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select item.*
  into run_item
  from api.training_session_run_items as item
  where item.run_id = requested_run_id
    and item.plan_item_id = requested_plan_item_id
    and item.user_id = actor_user_id
  for update;

  if not found or run_item.completed_at is not null then
    raise exception using errcode = '23514', message = 'Exercise cannot be substituted.';
  end if;
  if requested_substituted_at < (
    select run.started_at
    from api.training_session_runs as run
    where run.run_id = requested_run_id and run.user_id = actor_user_id
  ) then
    raise exception using errcode = '22023', message = 'Exercise substitution instant is invalid.';
  end if;
  if exists (
    select 1 from api.training_session_run_sets as performed
    where performed.run_id = requested_run_id
      and performed.plan_item_id = requested_plan_item_id
      and performed.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Exercise cannot be substituted after a completed set.';
  end if;

  select approved.*
  into alternative
  from api.training_plan_item_alternatives as approved
  join api.training_session_runs as run
    on run.run_id = requested_run_id
   and run.user_id = actor_user_id
   and run.plan_version_id = approved.version_id
  where approved.alternative_id = requested_alternative_id
    and approved.plan_item_id = requested_plan_item_id
    and approved.user_id = actor_user_id;

  if not found then
    raise exception using errcode = '23514', message = 'Approved alternative was not found.';
  end if;

  select substitution.*
  into stored
  from api.training_session_run_item_substitutions as substitution
  where substitution.run_id = requested_run_id
    and substitution.plan_item_id = requested_plan_item_id
    and substitution.user_id = actor_user_id;

  if found then
    if stored.operation_id is distinct from requested_operation_id
      or stored.alternative_id is distinct from requested_alternative_id
      or stored.reason is distinct from requested_reason
    then
      raise exception using errcode = '23505', message = 'Exercise already has a different substitution.';
    end if;
    return query select stored.alternative_id, stored.planned_exercise_name,
      stored.executed_exercise_name, stored.reason, stored.substituted_at, false;
    return;
  end if;

  insert into api.training_session_run_item_substitutions (
    run_id, plan_item_id, user_id, alternative_id, operation_id, reason,
    planned_exercise_name, executed_exercise_name, substituted_at
  ) values (
    requested_run_id, requested_plan_item_id, actor_user_id,
    requested_alternative_id, requested_operation_id, requested_reason,
    run_item.exercise_name, alternative.exercise_name, requested_substituted_at
  ) returning * into stored;

  update api.training_session_runs as run
  set updated_at = statement_timestamp()
  where run.run_id = requested_run_id and run.user_id = actor_user_id;

  return query select stored.alternative_id, stored.planned_exercise_name,
    stored.executed_exercise_name, stored.reason, stored.substituted_at, true;
end;
$$;

create function api.substitute_training_exercise(
  p_run_id uuid,
  p_plan_item_id uuid,
  p_alternative_id uuid,
  p_reason text,
  p_substituted_at timestamptz,
  p_operation_id text
)
returns table (
  alternative_id uuid,
  planned_exercise_name text,
  exercise_name text,
  reason text,
  substituted_at timestamptz,
  was_created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.substitute_training_exercise(
    (select auth.uid()), p_run_id, p_plan_item_id, p_alternative_id,
    p_reason, p_substituted_at, p_operation_id
  );
$$;

create function private.apply_training_set_substitution_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  substitution api.training_session_run_item_substitutions%rowtype;
begin
  new.planned_exercise_name := new.exercise_name;
  select current.* into substitution
  from api.training_session_run_item_substitutions as current
  where current.run_id = new.session_id
    and current.plan_item_id = new.plan_item_id
    and current.user_id = new.user_id;
  if found then
    new.planned_exercise_name := substitution.planned_exercise_name;
    new.exercise_name := substitution.executed_exercise_name;
  end if;
  return new;
end;
$$;

create trigger training_session_sets_apply_substitution_snapshot
before insert on api.training_session_sets
for each row execute function private.apply_training_set_substitution_snapshot();

create function private.archive_training_run_substitutions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into api.training_session_substitutions (
    session_id, plan_item_id, user_id, alternative_id, reason,
    planned_exercise_name, executed_exercise_name, substituted_at
  )
  select old.run_id, substitution.plan_item_id, old.user_id,
    substitution.alternative_id, substitution.reason,
    substitution.planned_exercise_name, substitution.executed_exercise_name,
    substitution.substituted_at
  from api.training_session_run_item_substitutions as substitution
  where substitution.run_id = old.run_id
    and substitution.user_id = old.user_id
    and exists (
      select 1 from api.training_sessions as session
      where session.session_id = old.run_id
        and session.user_id = old.user_id
    )
    and exists (
      select 1 from api.training_session_sets as performed
      where performed.session_id = old.run_id
        and performed.plan_item_id = substitution.plan_item_id
        and performed.user_id = old.user_id
    )
  on conflict (session_id, plan_item_id) do nothing;
  return old;
end;
$$;

create trigger training_session_runs_archive_substitutions
before delete on api.training_session_runs
for each row execute function private.archive_training_run_substitutions();

revoke all on function private.publish_training_plan_version_v3(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function api.publish_training_plan_version_v3(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function private.substitute_training_exercise(
  uuid, uuid, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function api.substitute_training_exercise(
  uuid, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function private.apply_training_set_substitution_snapshot()
from public, anon, authenticated;
revoke all on function private.archive_training_run_substitutions()
from public, anon, authenticated;

grant execute on function private.publish_training_plan_version_v3(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function api.publish_training_plan_version_v3(
  uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function private.substitute_training_exercise(
  uuid, uuid, uuid, uuid, text, timestamptz, text
) to authenticated;
grant execute on function api.substitute_training_exercise(
  uuid, uuid, uuid, text, timestamptz, text
) to authenticated;

comment on table api.training_plan_item_alternatives is
  'Approved exercise names that inherit the immutable prescription of their plan item.';
comment on table api.training_session_run_item_substitutions is
  'One local-first auditable substitution for an active exercise before its first completed set.';
comment on table api.training_session_substitutions is
  'Canonical substitution history preserving planned and executed exercise names.';

commit;
