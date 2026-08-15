-- Separate intra-session set progression from the equipment step used by
-- future inter-session progression decisions.
begin;

alter table api.training_plan_items
add column set_progression_kg numeric(7, 2);

update api.training_plan_items
set set_progression_kg = 0
where load_mode = 'external';

alter table api.training_plan_items
add constraint training_plan_items_set_progression check (
  set_progression_kg is null
  or (
    set_progression_kg between 0 and 2000
    and scale(set_progression_kg) <= 2
  )
),
add constraint training_plan_items_suggested_set_weight check (
  load_mode <> 'external'
  or planned_weight_kg + set_progression_kg * (sets - 1) <= 2000
);

alter table api.training_plan_items
drop constraint training_plan_items_load_contract,
add constraint training_plan_items_load_contract check (
  (
    modality = 'strength'
    and (
      (
        load_mode = 'unconfigured'
        and load_increment_kg is null
        and set_progression_kg is null
      )
      or (
        load_mode = 'external'
        and planned_weight_kg is not null
        and load_increment_kg is not null
        and set_progression_kg is not null
      )
      or (
        load_mode = 'none'
        and planned_weight_kg is null
        and load_increment_kg is null
        and set_progression_kg is null
      )
    )
  )
  or (
    modality <> 'strength'
    and load_mode = 'none'
    and planned_weight_kg is null
    and load_increment_kg is null
    and set_progression_kg is null
  )
);

create or replace function private.set_training_plan_item_load_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.modality <> 'strength'
    and new.load_mode = 'unconfigured'
    and new.load_increment_kg is null
  then
    new.load_mode := 'none';
  end if;

  if new.load_mode = 'external' and new.set_progression_kg is null then
    new.set_progression_kg := 0;
  elsif new.load_mode <> 'external' then
    new.set_progression_kg := null;
  end if;

  return new;
end;
$$;

alter table api.training_session_run_items
add column set_progression_kg numeric(7, 2),
add constraint training_session_run_items_set_progression check (
  set_progression_kg is null
  or (
    planned_weight_kg is not null
    and set_progression_kg between 0 and 2000
    and scale(set_progression_kg) <= 2
    and planned_weight_kg + set_progression_kg * (sets - 1) <= 2000
  )
);

update api.training_session_run_items as run_item
set set_progression_kg = plan_item.set_progression_kg
from api.training_plan_items as plan_item
where plan_item.item_id = run_item.plan_item_id
  and plan_item.user_id = run_item.user_id;

create or replace function private.copy_training_run_item_weight()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select item.planned_weight_kg, item.set_progression_kg
  into new.planned_weight_kg, new.set_progression_kg
  from api.training_plan_items as item
  where item.item_id = new.plan_item_id
    and item.user_id = new.user_id;
  return new;
end;
$$;

create function private.set_training_run_set_suggested_weight()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_item api.training_session_run_items%rowtype;
begin
  select item.*
  into run_item
  from api.training_session_run_items as item
  where item.run_id = new.run_id
    and item.plan_item_id = new.plan_item_id
    and item.user_id = new.user_id;

  if not found then
    raise exception using errcode = '23514', message = 'Exercise does not belong to the active training.';
  end if;

  if run_item.planned_weight_kg is null then
    new.planned_weight_kg := null;
  else
    new.planned_weight_kg := round(
      run_item.planned_weight_kg
      + coalesce(run_item.set_progression_kg, 0) * (new.set_number - 1),
      2
    );
  end if;

  return new;
end;
$$;

revoke all on function private.set_training_run_set_suggested_weight()
from public, anon, authenticated;

create trigger training_session_run_sets_suggest_weight
before insert on api.training_session_run_sets
for each row
execute function private.set_training_run_set_suggested_weight();

create function private.publish_training_plan_version_v2(
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
  progression numeric;
  sanitized_sessions jsonb;
  publication record;
begin
  if jsonb_typeof(requested_sessions) <> 'array' then
    raise exception using errcode = '22023', message = 'Plan publication command is invalid.';
  end if;

  for current_session in
    select session_entry.value
    from jsonb_array_elements(requested_sessions) as session_entry(value)
  loop
    if jsonb_typeof(current_session->'items') <> 'array' then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    for current_item in
      select item_entry.value
      from jsonb_array_elements(current_session->'items') as item_entry(value)
    loop
      if jsonb_typeof(current_item->'set_progression_kg') not in ('number', 'null')
        or (
          current_item->>'load_mode' = 'external'
          and jsonb_typeof(current_item->'set_progression_kg') is distinct from 'number'
        )
        or (
          current_item->>'load_mode' <> 'external'
          and jsonb_typeof(current_item->'set_progression_kg') is distinct from 'null'
        )
      then
        raise exception using errcode = '22023', message = 'Plan item progression is invalid.';
      end if;

      progression := case
        when jsonb_typeof(current_item->'set_progression_kg') = 'number'
        then (current_item->>'set_progression_kg')::numeric
      end;

      if progression is not null and (
        progression not between 0 and 2000
        or scale(progression) > 2
        or (
          jsonb_typeof(current_item->'planned_weight_kg') = 'number'
          and jsonb_typeof(current_item->'sets') = 'number'
          and (current_item->>'planned_weight_kg')::numeric
            + progression * ((current_item->>'sets')::integer - 1) > 2000
        )
      ) then
        raise exception using errcode = '22023', message = 'Plan item progression is invalid.';
      end if;
    end loop;
  end loop;

  select jsonb_agg(
    session_entry.value || jsonb_build_object(
      'items',
      (
        select jsonb_agg(item_entry.value - 'set_progression_kg' order by item_entry.ordinality)
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
  from private.publish_training_plan_version(
    actor_user_id,
    requested_plan_id,
    requested_operation_id,
    requested_content_sha256,
    requested_plan_name,
    requested_change_summary,
    sanitized_sessions
  );

  if publication.was_created then
    with requested_progression as (
      select
        (session_entry.value->>'day_order')::integer as day_order,
        (item_entry.value->>'order')::integer as item_order,
        case
          when jsonb_typeof(item_entry.value->'set_progression_kg') = 'number'
          then (item_entry.value->>'set_progression_kg')::numeric
        end as set_progression_kg
      from jsonb_array_elements(requested_sessions) as session_entry(value)
      cross join lateral jsonb_array_elements(session_entry.value->'items')
        as item_entry(value)
    )
    update api.training_plan_items as item
    set set_progression_kg = requested.set_progression_kg
    from api.training_plan_sessions as session,
      requested_progression as requested
    where item.version_id = publication.published_version_id
      and item.session_id = session.session_id
      and session.version_id = publication.published_version_id
      and session.day_order = requested.day_order
      and item.item_order = requested.item_order;
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

create function api.publish_training_plan_version_v2(
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
  select * from private.publish_training_plan_version_v2(
    (select auth.uid()), p_plan_id, p_operation_id, p_content_sha256,
    p_plan_name, p_change_summary, p_sessions
  );
$$;

revoke all on function private.publish_training_plan_version_v2(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function api.publish_training_plan_version_v2(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function private.publish_training_plan_version_v2(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function api.publish_training_plan_version_v2(
  uuid, text, text, text, text, jsonb
) to authenticated;

comment on column api.training_plan_items.load_increment_kg is
  'Configured equipment step for a future suggestion between comparable sessions; never applied inside one session.';
comment on column api.training_plan_items.set_progression_kg is
  'Editable automatic load increase between sets of the same exercise and session.';
comment on column api.training_session_run_items.set_progression_kg is
  'Immutable snapshot of the configured load increase between sets for one active run.';

commit;
