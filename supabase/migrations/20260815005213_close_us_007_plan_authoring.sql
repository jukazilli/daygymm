-- US-007: author, version, configure and archive a user-owned training plan.
begin;

alter table api.training_plans
add column archived_at timestamptz;

alter table api.training_plans
drop constraint training_plans_provenance;

alter table api.training_plans
add constraint training_plans_provenance check (
  provenance in ('official_xlsx', 'manual')
);

with ranked_plans as (
  select
    plan.plan_id,
    row_number() over (
      partition by plan.user_id
      order by
        exists (
          select 1
          from api.training_session_runs as run
          where run.plan_id = plan.plan_id
        ) desc,
        plan.updated_at desc,
        plan.plan_id desc
    ) as active_rank
  from api.training_plans as plan
)
update api.training_plans as plan
set archived_at = statement_timestamp()
from ranked_plans as ranked
where ranked.plan_id = plan.plan_id
  and ranked.active_rank > 1;

create unique index training_plans_one_active_per_user_idx
on api.training_plans (user_id)
where archived_at is null;

alter table api.training_plan_versions
add column author_user_id uuid,
add column change_summary text,
add column content_sha256 text,
add column origin text;

update api.training_plan_versions
set author_user_id = user_id,
  change_summary = 'Importação confirmada',
  origin = 'official_xlsx';

alter table api.training_plan_versions
alter column author_user_id set not null,
alter column change_summary set not null,
alter column origin set not null,
alter column source_sha256 drop not null,
alter column source_file_name drop not null,
alter column source_size_bytes drop not null;

alter table api.training_plan_versions
drop constraint training_plan_versions_sha256_format,
drop constraint training_plan_versions_file_name,
drop constraint training_plan_versions_file_size;

alter table api.training_plan_versions
add constraint training_plan_versions_origin check (
  origin in ('official_xlsx', 'manual')
),
add constraint training_plan_versions_change_summary check (
  char_length(change_summary) between 1 and 240
),
add constraint training_plan_versions_content_sha256 check (
  content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'
),
add constraint training_plan_versions_source_contract check (
  (
    origin = 'official_xlsx'
    and source_sha256 ~ '^[a-f0-9]{64}$'
    and char_length(source_file_name) between 6 and 120
    and right(lower(source_file_name), 5) = '.xlsx'
    and source_size_bytes between 1 and 2097152
    and content_sha256 is null
  )
  or (
    origin = 'manual'
    and source_sha256 is null
    and source_file_name is null
    and source_size_bytes is null
    and content_sha256 ~ '^[a-f0-9]{64}$'
  )
);

create function private.set_training_plan_version_metadata_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Older official-import commands intentionally do not know the new metadata
  -- columns. Complete their immutable version metadata at the table boundary.
  new.author_user_id := coalesce(new.author_user_id, new.user_id);
  new.change_summary := coalesce(
    nullif(btrim(new.change_summary), ''),
    'ImportaÃ§Ã£o confirmada'
  );
  new.origin := coalesce(
    new.origin,
    case when new.source_sha256 is null then 'manual' else 'official_xlsx' end
  );
  return new;
end;
$$;

create trigger training_plan_versions_complete_metadata
before insert on api.training_plan_versions
for each row execute function private.set_training_plan_version_metadata_defaults();

alter table api.training_plan_items
add column load_mode text not null default 'unconfigured',
add column load_increment_kg numeric(7, 2);

update api.training_plan_items
set load_mode = case
  when modality = 'strength' then 'unconfigured'
  else 'none'
end;

alter table api.training_plan_items
add constraint training_plan_items_load_mode check (
  load_mode in ('unconfigured', 'external', 'none')
),
add constraint training_plan_items_load_increment check (
  load_increment_kg is null
  or (
    load_increment_kg between 0.01 and 2000
    and scale(load_increment_kg) <= 2
  )
),
add constraint training_plan_items_load_contract check (
  (
    modality = 'strength'
    and (
      (load_mode = 'unconfigured' and load_increment_kg is null)
      or (
        load_mode = 'external'
        and planned_weight_kg is not null
        and load_increment_kg is not null
      )
      or (
        load_mode = 'none'
        and planned_weight_kg is null
        and load_increment_kg is null
      )
    )
  )
  or (
    modality <> 'strength'
    and load_mode = 'none'
    and load_increment_kg is null
  )
);

create function private.set_training_plan_item_load_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Existing XLSX import functions predate load configuration. Their omitted
  -- default is normalized only for modalities that can never carry a load.
  if new.modality <> 'strength'
    and new.load_mode = 'unconfigured'
    and new.load_increment_kg is null
  then
    new.load_mode := 'none';
  end if;
  return new;
end;
$$;

create trigger training_plan_items_complete_load_defaults
before insert on api.training_plan_items
for each row execute function private.set_training_plan_item_load_defaults();

comment on column api.training_plans.archived_at is
  'Removes a plan from future scheduling without deleting immutable versions or completed sessions.';
comment on column api.training_plan_versions.change_summary is
  'User-visible explanation for one immutable version.';
comment on column api.training_plan_items.load_mode is
  'Whether a strength item still needs configuration, uses external load, or has no external load.';
comment on column api.training_plan_items.load_increment_kg is
  'Smallest configured equipment step; it informs future progression and is never applied automatically per set.';

create function private.publish_training_plan_version(
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
  stored_plan api.training_plans%rowtype;
  stored_version api.training_plan_versions%rowtype;
  current_session jsonb;
  current_item jsonb;
  created_plan_id uuid;
  created_version_id uuid := gen_random_uuid();
  created_session_id uuid;
  session_day_order integer;
  session_name text;
  item_order_value integer;
  item_sets integer;
  item_reps_min integer;
  item_reps_max integer;
  item_duration_seconds integer;
  item_distance_meters integer;
  item_rest_seconds integer;
  item_modality text;
  item_circuit_group text;
  item_notes text;
  item_planned_weight numeric;
  item_load_mode text;
  item_load_increment numeric;
  total_sessions integer;
  total_items integer := 0;
  next_version integer;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or requested_content_sha256 is null
    or requested_content_sha256 !~ '^[a-f0-9]{64}$'
    or requested_plan_name is null
    or char_length(btrim(requested_plan_name)) not between 1 and 80
    or requested_change_summary is null
    or char_length(btrim(requested_change_summary)) not between 1 and 240
    or jsonb_typeof(requested_sessions) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Plan publication command is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));

  select version.* into stored_version
  from api.training_plan_versions as version
  where version.user_id = actor_user_id
    and version.operation_id = requested_operation_id;

  if found then
    if stored_version.content_sha256 is distinct from requested_content_sha256
    then
      raise exception using errcode = '23505', message = 'Plan operation was reused with different content.';
    end if;
    select plan.* into stored_plan
    from api.training_plans as plan
    where plan.plan_id = stored_version.plan_id
      and plan.user_id = actor_user_id;
    return query select stored_plan.plan_id, stored_version.version_id,
      stored_plan.name, stored_version.version_number,
      stored_plan.session_count, stored_plan.item_count, false;
    return;
  end if;

  if exists (
    select 1
    from api.training_session_runs as run
    where run.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Finish or cancel the active training before changing the plan.';
  end if;

  total_sessions := jsonb_array_length(requested_sessions);
  if total_sessions not between 1 and 14 then
    raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
  end if;

  for current_session in
    select session_entry.value
    from jsonb_array_elements(requested_sessions) as session_entry(value)
  loop
    if jsonb_typeof(current_session) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(current_session) as keys(key)
        where keys.key not in ('day_order', 'name', 'items')
      )
      or jsonb_typeof(current_session->'day_order') <> 'number'
      or (current_session->>'day_order') !~ '^[0-9]+$'
      or jsonb_typeof(current_session->'name') <> 'string'
      or jsonb_typeof(current_session->'items') <> 'array'
      or jsonb_array_length(current_session->'items') not between 1 and 100
    then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    session_day_order := (current_session->>'day_order')::integer;
    session_name := btrim(current_session->>'name');
    if session_day_order not between 1 and 14
      or char_length(session_name) not between 1 and 80
    then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    total_items := total_items + jsonb_array_length(current_session->'items');
    for current_item in
      select item_entry.value
      from jsonb_array_elements(current_session->'items') as item_entry(value)
    loop
      if jsonb_typeof(current_item) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(current_item) as keys(key)
          where keys.key not in (
            'order', 'exercise_name', 'modality', 'sets', 'reps_min', 'reps_max',
            'planned_weight_kg', 'load_mode', 'load_increment_kg',
            'duration_seconds', 'distance_meters', 'rest_seconds',
            'circuit_group', 'notes'
          )
        )
        or jsonb_typeof(current_item->'order') <> 'number'
        or (current_item->>'order') !~ '^[0-9]+$'
        or jsonb_typeof(current_item->'exercise_name') <> 'string'
        or jsonb_typeof(current_item->'modality') <> 'string'
        or jsonb_typeof(current_item->'sets') <> 'number'
        or (current_item->>'sets') !~ '^[0-9]+$'
        or jsonb_typeof(current_item->'rest_seconds') <> 'number'
        or (current_item->>'rest_seconds') !~ '^[0-9]+$'
        or jsonb_typeof(current_item->'load_mode') <> 'string'
        or jsonb_typeof(current_item->'planned_weight_kg') not in ('number', 'null')
        or jsonb_typeof(current_item->'load_increment_kg') not in ('number', 'null')
      then
        raise exception using errcode = '22023', message = 'Plan item is invalid.';
      end if;

      item_order_value := (current_item->>'order')::integer;
      item_sets := (current_item->>'sets')::integer;
      item_rest_seconds := (current_item->>'rest_seconds')::integer;
      item_modality := current_item->>'modality';
      item_load_mode := current_item->>'load_mode';
      item_reps_min := case when jsonb_typeof(current_item->'reps_min') = 'number' and (current_item->>'reps_min') ~ '^[0-9]+$' then (current_item->>'reps_min')::integer end;
      item_reps_max := case when jsonb_typeof(current_item->'reps_max') = 'number' and (current_item->>'reps_max') ~ '^[0-9]+$' then (current_item->>'reps_max')::integer end;
      item_duration_seconds := case when jsonb_typeof(current_item->'duration_seconds') = 'number' and (current_item->>'duration_seconds') ~ '^[0-9]+$' then (current_item->>'duration_seconds')::integer end;
      item_distance_meters := case when jsonb_typeof(current_item->'distance_meters') = 'number' and (current_item->>'distance_meters') ~ '^[0-9]+$' then (current_item->>'distance_meters')::integer end;
      item_circuit_group := case when jsonb_typeof(current_item->'circuit_group') = 'string' then nullif(btrim(current_item->>'circuit_group'), '') end;
      item_notes := case when jsonb_typeof(current_item->'notes') = 'string' then nullif(btrim(current_item->>'notes'), '') end;
      item_planned_weight := case when jsonb_typeof(current_item->'planned_weight_kg') = 'number' then (current_item->>'planned_weight_kg')::numeric end;
      item_load_increment := case when jsonb_typeof(current_item->'load_increment_kg') = 'number' then (current_item->>'load_increment_kg')::numeric end;

      if item_order_value not between 1 and 100
        or char_length(btrim(current_item->>'exercise_name')) not between 1 and 120
        or item_modality not in ('strength', 'time', 'distance', 'cardio', 'circuit')
        or item_sets not between 1 and 20
        or item_rest_seconds not between 0 and 1800
        or item_load_mode not in ('unconfigured', 'external', 'none')
        or (item_reps_min is not null and item_reps_min not between 1 and 1000)
        or (item_reps_max is not null and item_reps_max not between 1 and 1000)
        or (item_reps_min is not null and item_reps_max is not null and item_reps_max < item_reps_min)
        or (item_duration_seconds is not null and item_duration_seconds not between 1 and 7200)
        or (item_distance_meters is not null and item_distance_meters not between 1 and 100000)
        or (item_circuit_group is not null and char_length(item_circuit_group) > 40)
        or (item_notes is not null and char_length(item_notes) > 500)
        or (item_planned_weight is not null and (item_planned_weight not between 0.25 and 2000 or scale(item_planned_weight) > 2))
        or (item_load_increment is not null and (item_load_increment not between 0.01 and 2000 or scale(item_load_increment) > 2))
        or (item_modality = 'strength' and (item_reps_min is null or item_reps_max is null))
        or (item_modality = 'time' and item_duration_seconds is null)
        or (item_modality in ('distance', 'cardio') and item_distance_meters is null and item_duration_seconds is null)
        or (item_modality = 'circuit' and item_circuit_group is null)
        or (item_modality <> 'strength' and (item_load_mode <> 'none' or item_planned_weight is not null or item_load_increment is not null))
        or (item_modality = 'strength' and item_load_mode = 'external' and (item_planned_weight is null or item_load_increment is null))
        or (item_modality = 'strength' and item_load_mode = 'none' and (item_planned_weight is not null or item_load_increment is not null))
        or (item_modality = 'strength' and item_load_mode = 'unconfigured' and item_load_increment is not null)
      then
        raise exception using errcode = '22023', message = 'Plan item is invalid.';
      end if;
    end loop;
  end loop;

  if total_items not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Plan item count is invalid.';
  end if;

  if requested_plan_id is null then
    if not exists (
      select 1
      from api.onboarding_contexts as context
      where context.user_id = actor_user_id
        and context.completed_at is not null
        and context.plan_source = 'manual'
    ) then
      raise exception using errcode = '23514', message = 'Manual creation is not the selected plan source.';
    end if;

    update api.training_plans as previous
    set archived_at = statement_timestamp(), updated_at = statement_timestamp()
    where previous.user_id = actor_user_id
      and previous.archived_at is null;

    created_plan_id := gen_random_uuid();
    next_version := 1;
    insert into api.training_plans (
      plan_id, user_id, name, provenance, current_version,
      session_count, item_count
    ) values (
      created_plan_id, actor_user_id, btrim(requested_plan_name), 'manual', 1,
      total_sessions, total_items
    ) returning * into stored_plan;
  else
    select plan.* into stored_plan
    from api.training_plans as plan
    where plan.plan_id = requested_plan_id
      and plan.user_id = actor_user_id
      and plan.archived_at is null
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'Active plan was not found.';
    end if;
    created_plan_id := stored_plan.plan_id;
    next_version := stored_plan.current_version + 1;
  end if;

  insert into api.training_plan_versions (
    version_id, plan_id, user_id, version_number, operation_id,
    source_sha256, source_file_name, source_size_bytes,
    author_user_id, change_summary, content_sha256, origin
  ) values (
    created_version_id, created_plan_id, actor_user_id, next_version,
    requested_operation_id, null, null, null, actor_user_id,
    btrim(requested_change_summary), requested_content_sha256, 'manual'
  ) returning * into stored_version;

  for current_session in
    select session_entry.value
    from jsonb_array_elements(requested_sessions) as session_entry(value)
  loop
    created_session_id := gen_random_uuid();
    insert into api.training_plan_sessions (
      session_id, version_id, user_id, day_order, name
    ) values (
      created_session_id, created_version_id, actor_user_id,
      (current_session->>'day_order')::integer,
      btrim(current_session->>'name')
    );

    for current_item in
      select item_entry.value
      from jsonb_array_elements(current_session->'items') as item_entry(value)
    loop
      insert into api.training_plan_items (
        item_id, session_id, version_id, user_id, item_order, exercise_name,
        modality, sets, reps_min, reps_max, planned_weight_kg, load_mode,
        load_increment_kg, duration_seconds, distance_meters, rest_seconds,
        circuit_group, notes
      ) values (
        gen_random_uuid(), created_session_id, created_version_id, actor_user_id,
        (current_item->>'order')::integer,
        btrim(current_item->>'exercise_name'), current_item->>'modality',
        (current_item->>'sets')::integer,
        case when jsonb_typeof(current_item->'reps_min') = 'number' then (current_item->>'reps_min')::integer end,
        case when jsonb_typeof(current_item->'reps_max') = 'number' then (current_item->>'reps_max')::integer end,
        case when jsonb_typeof(current_item->'planned_weight_kg') = 'number' then (current_item->>'planned_weight_kg')::numeric end,
        current_item->>'load_mode',
        case when jsonb_typeof(current_item->'load_increment_kg') = 'number' then (current_item->>'load_increment_kg')::numeric end,
        case when jsonb_typeof(current_item->'duration_seconds') = 'number' then (current_item->>'duration_seconds')::integer end,
        case when jsonb_typeof(current_item->'distance_meters') = 'number' then (current_item->>'distance_meters')::integer end,
        (current_item->>'rest_seconds')::integer,
        case when jsonb_typeof(current_item->'circuit_group') = 'string' then nullif(btrim(current_item->>'circuit_group'), '') end,
        case when jsonb_typeof(current_item->'notes') = 'string' then nullif(btrim(current_item->>'notes'), '') end
      );
    end loop;
  end loop;

  update api.training_plans as plan
  set active_version_id = created_version_id,
    current_version = next_version,
    name = btrim(requested_plan_name),
    session_count = total_sessions,
    item_count = total_items,
    updated_at = statement_timestamp(),
    archived_at = null
  where plan.plan_id = created_plan_id
    and plan.user_id = actor_user_id
  returning * into stored_plan;

  return query select stored_plan.plan_id, stored_version.version_id,
    stored_plan.name, stored_version.version_number,
    stored_plan.session_count, stored_plan.item_count, true;
end;
$$;

create function api.publish_training_plan_version(
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
  select * from private.publish_training_plan_version(
    (select auth.uid()), p_plan_id, p_operation_id, p_content_sha256,
    p_plan_name, p_change_summary, p_sessions
  );
$$;

create function private.archive_training_plan(
  actor_user_id uuid,
  requested_plan_id uuid
)
returns table (
  archived_plan_id uuid,
  archived_on timestamptz,
  was_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_plan api.training_plans%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_plan_id is null then
    raise exception using errcode = '22023', message = 'Plan archive command is invalid.';
  end if;
  if exists (
    select 1 from api.training_session_runs as run
    where run.user_id = actor_user_id and run.plan_id = requested_plan_id
  ) then
    raise exception using errcode = '23514', message = 'Finish or cancel the active training before archiving the plan.';
  end if;
  update api.training_plans as plan
  set archived_at = statement_timestamp(), updated_at = statement_timestamp()
  where plan.plan_id = requested_plan_id
    and plan.user_id = actor_user_id
    and plan.archived_at is null
  returning plan.* into stored_plan;
  if not found then
    raise exception using errcode = '23514', message = 'Active plan was not found.';
  end if;
  return query select stored_plan.plan_id, stored_plan.archived_at, true;
end;
$$;

create function api.archive_training_plan(p_plan_id uuid)
returns table (plan_id uuid, archived_at timestamptz, was_changed boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.archive_training_plan((select auth.uid()), p_plan_id);
$$;

create function private.restore_training_plan(
  actor_user_id uuid,
  requested_plan_id uuid
)
returns table (
  restored_plan_id uuid,
  was_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_plan api.training_plans%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_plan_id is null then
    raise exception using errcode = '22023', message = 'Plan restore command is invalid.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));
  if exists (
    select 1 from api.training_session_runs as run where run.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Finish or cancel the active training before restoring a plan.';
  end if;
  select plan.* into stored_plan
  from api.training_plans as plan
  where plan.plan_id = requested_plan_id and plan.user_id = actor_user_id;
  if not found then
    raise exception using errcode = '23514', message = 'Plan was not found.';
  end if;
  update api.training_plans as plan
  set archived_at = statement_timestamp(), updated_at = statement_timestamp()
  where plan.user_id = actor_user_id
    and plan.archived_at is null
    and plan.plan_id <> requested_plan_id;
  update api.training_plans as plan
  set archived_at = null, updated_at = statement_timestamp()
  where plan.plan_id = requested_plan_id and plan.user_id = actor_user_id;
  return query select requested_plan_id, stored_plan.archived_at is not null;
end;
$$;

create function api.restore_training_plan(p_plan_id uuid)
returns table (plan_id uuid, was_changed boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.restore_training_plan((select auth.uid()), p_plan_id);
$$;

create function private.import_official_xlsx_plan_as_active(
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
  import_result record;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_user_id::text, 0));
  if exists (
    select 1 from api.training_session_runs as run where run.user_id = actor_user_id
  ) then
    raise exception using errcode = '23514', message = 'Finish or cancel the active training before importing another plan.';
  end if;
  update api.training_plans as plan
  set archived_at = statement_timestamp(), updated_at = statement_timestamp()
  where plan.user_id = actor_user_id and plan.archived_at is null;
  select * into import_result
  from private.import_official_xlsx_plan_with_weights(
    actor_user_id, requested_operation_id, requested_source_sha256,
    requested_source_file_name, requested_source_size_bytes,
    requested_plan_name, requested_sessions
  );
  update api.training_plans as plan
  set archived_at = null, updated_at = statement_timestamp()
  where plan.plan_id = import_result.imported_plan_id
    and plan.user_id = actor_user_id;
  return query select import_result.imported_plan_id,
    import_result.imported_version_id, import_result.imported_plan_name,
    import_result.imported_version, import_result.imported_session_count,
    import_result.imported_item_count, import_result.was_created;
end;
$$;

create or replace function api.import_official_xlsx_plan(
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
  select * from private.import_official_xlsx_plan_as_active(
    (select auth.uid()), p_operation_id, p_source_sha256,
    p_source_file_name, p_source_size_bytes, p_plan_name, p_sessions
  );
$$;

create or replace function api.import_official_xlsx_plan_v2(
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
  select * from private.import_official_xlsx_plan_as_active(
    (select auth.uid()), p_operation_id, p_source_sha256,
    p_source_file_name, p_source_size_bytes, p_plan_name, p_sessions
  );
$$;

create function private.ensure_training_run_plan_active()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from api.training_plans as plan
    where plan.plan_id = new.plan_id
      and plan.user_id = new.user_id
      and plan.archived_at is null
      and plan.active_version_id = new.plan_version_id
  ) then
    raise exception using errcode = '23514', message = 'The selected training plan is not active.';
  end if;
  return new;
end;
$$;

create trigger training_session_runs_require_active_plan
before insert on api.training_session_runs
for each row execute function private.ensure_training_run_plan_active();

create or replace function private.rename_training_plan(
  actor_user_id uuid,
  requested_plan_id uuid,
  requested_name text
)
returns table (
  renamed_plan_id uuid,
  renamed_plan_name text,
  renamed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_plan api.training_plans%rowtype;
begin
  if actor_user_id is null or (select auth.uid()) is distinct from actor_user_id then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if requested_plan_id is null or requested_name is null
    or char_length(btrim(requested_name)) not between 1 and 80
  then
    raise exception using errcode = '22023', message = 'Plan name is invalid.';
  end if;
  update api.training_plans as plan
  set name = btrim(requested_name), updated_at = statement_timestamp()
  where plan.plan_id = requested_plan_id
    and plan.user_id = actor_user_id
    and plan.archived_at is null
  returning plan.* into stored_plan;
  if not found then
    raise exception using errcode = '23514', message = 'Active plan was not found.';
  end if;
  return query select stored_plan.plan_id, stored_plan.name, stored_plan.updated_at;
end;
$$;

revoke all on function private.publish_training_plan_version(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function private.archive_training_plan(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.restore_training_plan(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.import_official_xlsx_plan_as_active(
  uuid, text, text, text, integer, text, jsonb
) from public, anon, authenticated;
revoke all on function private.ensure_training_run_plan_active()
from public, anon, authenticated;
revoke all on function private.set_training_plan_version_metadata_defaults()
from public, anon, authenticated;
revoke all on function private.set_training_plan_item_load_defaults()
from public, anon, authenticated;
revoke all on function api.publish_training_plan_version(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function api.archive_training_plan(uuid)
from public, anon, authenticated;
revoke all on function api.restore_training_plan(uuid)
from public, anon, authenticated;

grant execute on function private.publish_training_plan_version(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function private.archive_training_plan(uuid, uuid)
to authenticated;
grant execute on function private.restore_training_plan(uuid, uuid)
to authenticated;
grant execute on function private.import_official_xlsx_plan_as_active(
  uuid, text, text, text, integer, text, jsonb
) to authenticated;
grant execute on function api.publish_training_plan_version(
  uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function api.archive_training_plan(uuid)
to authenticated;
grant execute on function api.restore_training_plan(uuid)
to authenticated;

commit;
