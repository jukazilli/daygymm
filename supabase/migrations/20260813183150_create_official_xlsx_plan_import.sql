-- US-005: confirm a locally parsed official XLSX as one immutable plan version.
begin;

create table api.training_plans (
  plan_id uuid primary key,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  name text not null,
  provenance text not null,
  active_version_id uuid,
  current_version integer not null default 1,
  session_count integer not null,
  item_count integer not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint training_plans_name_length check (char_length(name) between 1 and 80),
  constraint training_plans_provenance check (provenance = 'official_xlsx'),
  constraint training_plans_current_version_positive check (current_version > 0),
  constraint training_plans_session_count check (session_count between 1 and 14),
  constraint training_plans_item_count check (item_count between 1 and 300)
);

create index training_plans_user_updated_idx
on api.training_plans (user_id, updated_at desc, plan_id desc);

create table api.training_plan_versions (
  version_id uuid primary key,
  plan_id uuid not null references api.training_plans(plan_id) on delete cascade,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  version_number integer not null,
  operation_id text not null,
  source_sha256 text not null,
  source_file_name text not null,
  source_size_bytes integer not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint training_plan_versions_version_positive check (version_number > 0),
  constraint training_plan_versions_operation_format check (
    char_length(operation_id) between 16 and 128
    and operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint training_plan_versions_sha256_format check (
    source_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint training_plan_versions_file_name check (
    char_length(source_file_name) between 6 and 120
    and right(lower(source_file_name), 5) = '.xlsx'
  ),
  constraint training_plan_versions_file_size check (
    source_size_bytes between 1 and 2097152
  ),
  constraint training_plan_versions_plan_version_unique unique (
    plan_id,
    version_number
  ),
  constraint training_plan_versions_user_operation_unique unique (
    user_id,
    operation_id
  ),
  constraint training_plan_versions_user_source_unique unique (
    user_id,
    source_sha256
  )
);

create index training_plan_versions_user_created_idx
on api.training_plan_versions (user_id, created_at desc, version_id desc);

alter table api.training_plans
add constraint training_plans_active_version_fkey
foreign key (active_version_id)
references api.training_plan_versions(version_id)
on delete restrict;

create table api.training_plan_sessions (
  session_id uuid primary key,
  version_id uuid not null references api.training_plan_versions(version_id) on delete cascade,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  day_order integer not null,
  name text not null,
  constraint training_plan_sessions_day_order check (day_order between 1 and 14),
  constraint training_plan_sessions_name_length check (char_length(name) between 1 and 80),
  constraint training_plan_sessions_version_day_unique unique (version_id, day_order)
);

create index training_plan_sessions_user_version_idx
on api.training_plan_sessions (user_id, version_id, day_order);

create table api.training_plan_items (
  item_id uuid primary key,
  session_id uuid not null references api.training_plan_sessions(session_id) on delete cascade,
  version_id uuid not null references api.training_plan_versions(version_id) on delete cascade,
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
  constraint training_plan_items_order check (item_order between 1 and 100),
  constraint training_plan_items_exercise_length check (
    char_length(exercise_name) between 1 and 120
  ),
  constraint training_plan_items_modality check (
    modality in ('strength', 'time', 'distance', 'cardio', 'circuit')
  ),
  constraint training_plan_items_sets check (sets between 1 and 20),
  constraint training_plan_items_reps_min check (
    reps_min is null or reps_min between 1 and 1000
  ),
  constraint training_plan_items_reps_max check (
    reps_max is null or reps_max between 1 and 1000
  ),
  constraint training_plan_items_reps_order check (
    reps_min is null or reps_max is null or reps_max >= reps_min
  ),
  constraint training_plan_items_duration check (
    duration_seconds is null or duration_seconds between 1 and 7200
  ),
  constraint training_plan_items_distance check (
    distance_meters is null or distance_meters between 1 and 100000
  ),
  constraint training_plan_items_rest check (rest_seconds between 0 and 1800),
  constraint training_plan_items_circuit_group_length check (
    circuit_group is null or char_length(circuit_group) between 1 and 40
  ),
  constraint training_plan_items_notes_length check (
    notes is null or char_length(notes) <= 500
  ),
  constraint training_plan_items_modality_data check (
    (modality <> 'strength' or (reps_min is not null and reps_max is not null))
    and (modality <> 'time' or duration_seconds is not null)
    and (
      modality not in ('distance', 'cardio')
      or distance_meters is not null
      or duration_seconds is not null
    )
    and (modality <> 'circuit' or circuit_group is not null)
  ),
  constraint training_plan_items_session_order_unique unique (
    session_id,
    item_order
  )
);

create index training_plan_items_user_version_idx
on api.training_plan_items (user_id, version_id, session_id, item_order);

comment on table api.training_plans is
  'User-owned training plans; the active version is selected explicitly.';
comment on table api.training_plan_versions is
  'Immutable confirmed plan versions created from normalized proposals.';
comment on column api.training_plan_versions.source_file_name is
  'Sanitized provenance only; the original XLSX is not uploaded.';
comment on table api.training_plan_sessions is
  'Ordered sessions belonging to one immutable plan version.';
comment on table api.training_plan_items is
  'Normalized items belonging to one imported session; no spreadsheet formula is stored.';

alter table api.training_plans enable row level security;
alter table api.training_plans force row level security;
alter table api.training_plan_versions enable row level security;
alter table api.training_plan_versions force row level security;
alter table api.training_plan_sessions enable row level security;
alter table api.training_plan_sessions force row level security;
alter table api.training_plan_items enable row level security;
alter table api.training_plan_items force row level security;

create policy training_plans_select_own
on api.training_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_plan_versions_select_own
on api.training_plan_versions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_plan_sessions_select_own
on api.training_plan_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy training_plan_items_select_own
on api.training_plan_items
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_plans from public, anon, authenticated;
revoke all on table api.training_plan_versions from public, anon, authenticated;
revoke all on table api.training_plan_sessions from public, anon, authenticated;
revoke all on table api.training_plan_items from public, anon, authenticated;
grant select on table api.training_plans to authenticated;
grant select on table api.training_plan_versions to authenticated;
grant select on table api.training_plan_sessions to authenticated;
grant select on table api.training_plan_items to authenticated;

create function private.import_official_xlsx_plan(
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
  stored_plan api.training_plans%rowtype;
  stored_version api.training_plan_versions%rowtype;
  session_value jsonb;
  item_value jsonb;
  created_session_id uuid;
  created_plan_id uuid := gen_random_uuid();
  created_version_id uuid := gen_random_uuid();
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
  total_sessions integer;
  total_items integer := 0;
begin
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_operation_id is null
    or char_length(requested_operation_id) not between 16 and 128
    or requested_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or requested_source_sha256 is null
    or requested_source_sha256 !~ '^[a-f0-9]{64}$'
    or requested_source_file_name is null
    or char_length(requested_source_file_name) not between 6 and 120
    or right(lower(requested_source_file_name), 5) <> '.xlsx'
    or requested_source_size_bytes not between 1 and 2097152
    or requested_plan_name is null
    or char_length(btrim(requested_plan_name)) not between 1 and 80
    or jsonb_typeof(requested_sessions) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Plan import command is invalid.';
  end if;

  if not exists (
    select 1
    from api.onboarding_contexts as context
    where context.user_id = actor_user_id
      and context.completed_at is not null
      and context.plan_source = 'official_xlsx'
  ) then
    raise exception using errcode = '23514', message = 'Official XLSX is not the selected plan source.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(actor_user_id::text || ':' || requested_source_sha256, 0)
  );

  select version.*
  into stored_version
  from api.training_plan_versions as version
  where version.user_id = actor_user_id
    and (
      version.operation_id = requested_operation_id
      or version.source_sha256 = requested_source_sha256
    )
  order by (version.operation_id = requested_operation_id) desc
  limit 1;

  if found then
    if stored_version.operation_id = requested_operation_id
      and stored_version.source_sha256 <> requested_source_sha256
    then
      raise exception using errcode = '23505', message = 'Import operation was reused with different content.';
    end if;

    select plan.* into stored_plan
    from api.training_plans as plan
    where plan.plan_id = stored_version.plan_id;

    return query select
      stored_plan.plan_id,
      stored_version.version_id,
      stored_plan.name,
      stored_version.version_number,
      stored_plan.session_count,
      stored_plan.item_count,
      false;
    return;
  end if;

  total_sessions := jsonb_array_length(requested_sessions);
  if total_sessions not between 1 and 14 then
    raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
  end if;

  for session_value in select value from jsonb_array_elements(requested_sessions)
  loop
    if jsonb_typeof(session_value) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(session_value) as keys(key)
        where keys.key not in ('day_order', 'name', 'items')
      )
      or jsonb_typeof(session_value->'items') <> 'array'
      or jsonb_array_length(session_value->'items') not between 1 and 100
    then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    total_items := total_items + jsonb_array_length(session_value->'items');
  end loop;

  if total_items not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Plan item count is invalid.';
  end if;

  insert into api.training_plans (
    plan_id, user_id, name, provenance, current_version, session_count, item_count
  ) values (
    created_plan_id, actor_user_id, btrim(requested_plan_name), 'official_xlsx',
    1, total_sessions, total_items
  ) returning * into stored_plan;

  insert into api.training_plan_versions (
    version_id, plan_id, user_id, version_number, operation_id, source_sha256,
    source_file_name, source_size_bytes
  ) values (
    created_version_id, created_plan_id, actor_user_id, 1, requested_operation_id,
    requested_source_sha256, requested_source_file_name, requested_source_size_bytes
  ) returning * into stored_version;

  for session_value in select value from jsonb_array_elements(requested_sessions)
  loop
    if jsonb_typeof(session_value) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(session_value) as keys(key)
        where keys.key not in ('day_order', 'name', 'items')
      )
      or jsonb_typeof(session_value->'day_order') <> 'number'
      or (session_value->>'day_order') !~ '^[0-9]+$'
      or jsonb_typeof(session_value->'name') <> 'string'
      or jsonb_typeof(session_value->'items') <> 'array'
    then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    session_day_order := (session_value->>'day_order')::integer;
    session_name := btrim(session_value->>'name');
    if session_day_order not between 1 and 14
      or char_length(session_name) not between 1 and 80
      or jsonb_array_length(session_value->'items') not between 1 and 100
    then
      raise exception using errcode = '22023', message = 'Plan session is invalid.';
    end if;

    created_session_id := gen_random_uuid();
    insert into api.training_plan_sessions (
      session_id, version_id, user_id, day_order, name
    ) values (
      created_session_id, created_version_id, actor_user_id, session_day_order, session_name
    );

    for item_value in select value from jsonb_array_elements(session_value->'items')
    loop
      if jsonb_typeof(item_value) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(item_value) as keys(key)
          where keys.key not in (
            'order', 'exercise_name', 'modality', 'sets', 'reps_min', 'reps_max',
            'duration_seconds', 'distance_meters', 'rest_seconds', 'circuit_group',
            'notes'
          )
        )
      then
        raise exception using errcode = '22023', message = 'Plan item is invalid.';
      end if;

      if jsonb_typeof(item_value->'order') <> 'number'
        or (item_value->>'order') !~ '^[0-9]+$'
        or jsonb_typeof(item_value->'exercise_name') <> 'string'
        or jsonb_typeof(item_value->'modality') <> 'string'
        or jsonb_typeof(item_value->'sets') <> 'number'
        or (item_value->>'sets') !~ '^[0-9]+$'
        or jsonb_typeof(item_value->'rest_seconds') <> 'number'
        or (item_value->>'rest_seconds') !~ '^[0-9]+$'
      then
        raise exception using errcode = '22023', message = 'Plan item is invalid.';
      end if;

      item_order_value := (item_value->>'order')::integer;
      item_sets := (item_value->>'sets')::integer;
      item_rest_seconds := (item_value->>'rest_seconds')::integer;
      item_modality := item_value->>'modality';
      item_reps_min := case when jsonb_typeof(item_value->'reps_min') = 'number' and (item_value->>'reps_min') ~ '^[0-9]+$' then (item_value->>'reps_min')::integer end;
      item_reps_max := case when jsonb_typeof(item_value->'reps_max') = 'number' and (item_value->>'reps_max') ~ '^[0-9]+$' then (item_value->>'reps_max')::integer end;
      item_duration_seconds := case when jsonb_typeof(item_value->'duration_seconds') = 'number' and (item_value->>'duration_seconds') ~ '^[0-9]+$' then (item_value->>'duration_seconds')::integer end;
      item_distance_meters := case when jsonb_typeof(item_value->'distance_meters') = 'number' and (item_value->>'distance_meters') ~ '^[0-9]+$' then (item_value->>'distance_meters')::integer end;
      item_circuit_group := case when jsonb_typeof(item_value->'circuit_group') = 'string' then nullif(btrim(item_value->>'circuit_group'), '') end;
      item_notes := case when jsonb_typeof(item_value->'notes') = 'string' then nullif(btrim(item_value->>'notes'), '') end;

      if item_order_value not between 1 and 100
        or char_length(btrim(item_value->>'exercise_name')) not between 1 and 120
        or item_modality not in ('strength', 'time', 'distance', 'cardio', 'circuit')
        or item_sets not between 1 and 20
        or item_rest_seconds not between 0 and 1800
        or (item_reps_min is not null and item_reps_min not between 1 and 1000)
        or (item_reps_max is not null and item_reps_max not between 1 and 1000)
        or (item_reps_min is not null and item_reps_max is not null and item_reps_max < item_reps_min)
        or (item_duration_seconds is not null and item_duration_seconds not between 1 and 7200)
        or (item_distance_meters is not null and item_distance_meters not between 1 and 100000)
        or (item_circuit_group is not null and char_length(item_circuit_group) > 40)
        or (item_notes is not null and char_length(item_notes) > 500)
        or (item_modality = 'strength' and (item_reps_min is null or item_reps_max is null))
        or (item_modality = 'time' and item_duration_seconds is null)
        or (item_modality in ('distance', 'cardio') and item_distance_meters is null and item_duration_seconds is null)
        or (item_modality = 'circuit' and item_circuit_group is null)
      then
        raise exception using errcode = '22023', message = 'Plan item is invalid.';
      end if;

      insert into api.training_plan_items (
        item_id, session_id, version_id, user_id, item_order, exercise_name,
        modality, sets, reps_min, reps_max, duration_seconds, distance_meters,
        rest_seconds, circuit_group, notes
      ) values (
        gen_random_uuid(), created_session_id, created_version_id, actor_user_id,
        item_order_value, btrim(item_value->>'exercise_name'), item_modality,
        item_sets, item_reps_min, item_reps_max, item_duration_seconds,
        item_distance_meters, item_rest_seconds, item_circuit_group, item_notes
      );
    end loop;
  end loop;

  update api.training_plans
  set active_version_id = created_version_id
  where plan_id = created_plan_id;

  return query select
    created_plan_id,
    created_version_id,
    btrim(requested_plan_name),
    1,
    total_sessions,
    total_items,
    true;
end;
$$;

-- The invoker wrapper is exposed; the definer command remains outside Data API.
create function api.import_official_xlsx_plan(
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
  select *
  from private.import_official_xlsx_plan(
    (select auth.uid()),
    p_operation_id,
    p_source_sha256,
    p_source_file_name,
    p_source_size_bytes,
    p_plan_name,
    p_sessions
  );
$$;

revoke all on function private.import_official_xlsx_plan(
  uuid, text, text, text, integer, text, jsonb
) from public, anon, authenticated;
revoke all on function api.import_official_xlsx_plan(
  text, text, text, integer, text, jsonb
) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.import_official_xlsx_plan(
  uuid, text, text, text, integer, text, jsonb
) to authenticated;
grant execute on function api.import_official_xlsx_plan(
  text, text, text, integer, text, jsonb
) to authenticated;

commit;
