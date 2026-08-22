-- Keep the already-applied US-008A migration append-only while removing an
-- ambiguous PL/pgSQL identifier detected by the hosted schema linter.
begin;

create or replace function private.import_official_xlsx_plan_with_weights(
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
  current_session jsonb;
  current_item jsonb;
  sanitized_sessions jsonb;
  import_result record;
  item_weight numeric;
begin
  if jsonb_typeof(requested_sessions) <> 'array' then
    raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
  end if;

  for current_session in
    select session_entry.value
    from jsonb_array_elements(requested_sessions) as session_entry(value)
  loop
    if jsonb_typeof(current_session) <> 'object'
      or jsonb_typeof(current_session->'items') <> 'array'
    then
      raise exception using errcode = '22023', message = 'Plan sessions are invalid.';
    end if;

    for current_item in
      select item_entry.value
      from jsonb_array_elements(current_session->'items') as item_entry(value)
    loop
      if jsonb_typeof(current_item) <> 'object' then
        raise exception using errcode = '22023', message = 'Plan items are invalid.';
      end if;
      if current_item ? 'planned_weight_kg'
        and jsonb_typeof(current_item->'planned_weight_kg') not in ('number', 'null')
      then
        raise exception using errcode = '22023', message = 'Planned weight is invalid.';
      end if;

      item_weight := case
        when jsonb_typeof(current_item->'planned_weight_kg') = 'number'
        then (current_item->>'planned_weight_kg')::numeric
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
      'day_order', session_entry.value->'day_order',
      'name', session_entry.value->'name',
      'items', (
        select jsonb_agg(item_entry.value - 'planned_weight_kg')
        from jsonb_array_elements(session_entry.value->'items')
          as item_entry(value)
      )
    )
  )
  into sanitized_sessions
  from jsonb_array_elements(requested_sessions) as session_entry(value);

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
    for current_session in
      select session_entry.value
      from jsonb_array_elements(requested_sessions) as session_entry(value)
    loop
      for current_item in
        select item_entry.value
        from jsonb_array_elements(current_session->'items') as item_entry(value)
      loop
        item_weight := case
          when jsonb_typeof(current_item->'planned_weight_kg') = 'number'
          then (current_item->>'planned_weight_kg')::numeric
        end;

        update api.training_plan_items as item
        set planned_weight_kg = item_weight
        from api.training_plan_sessions as planned
        where item.session_id = planned.session_id
          and item.version_id = import_result.imported_version_id
          and planned.day_order = (current_session->>'day_order')::integer
          and item.item_order = (current_item->>'order')::integer;
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

revoke all on function private.import_official_xlsx_plan_with_weights(
  uuid, text, text, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function private.import_official_xlsx_plan_with_weights(
  uuid, text, text, text, integer, text, jsonb
) to authenticated;

commit;
