-- Pre-US-007 correction: explicit weekly schedule and user-owned plan title.
begin;

create table api.training_plan_schedule_entries (
  schedule_entry_id uuid primary key default gen_random_uuid(),
  version_id uuid not null references api.training_plan_versions(version_id) on delete cascade,
  planned_session_id uuid not null references api.training_plan_sessions(session_id) on delete cascade,
  user_id uuid not null references api.profiles(user_id) on delete cascade,
  weekday integer not null,
  slot_order integer not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint training_plan_schedule_entries_session_unique unique (planned_session_id),
  constraint training_plan_schedule_entries_slot_unique unique (
    version_id,
    weekday,
    slot_order
  ),
  constraint training_plan_schedule_entries_weekday check (weekday between 1 and 7),
  constraint training_plan_schedule_entries_slot check (slot_order between 1 and 2)
);

create index training_plan_schedule_entries_user_version_idx
on api.training_plan_schedule_entries (user_id, version_id, weekday, slot_order);

comment on table api.training_plan_schedule_entries is
  'Explicit Monday-to-Sunday projection for immutable planned sessions; 1 is Monday and 7 is Sunday.';

alter table api.training_plan_schedule_entries enable row level security;
alter table api.training_plan_schedule_entries force row level security;

create policy training_plan_schedule_entries_select_own
on api.training_plan_schedule_entries
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table api.training_plan_schedule_entries from public, anon, authenticated;
grant select on table api.training_plan_schedule_entries to authenticated;

create function private.seed_training_plan_schedule_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into api.training_plan_schedule_entries (
    version_id,
    planned_session_id,
    user_id,
    weekday,
    slot_order
  ) values (
    new.version_id,
    new.session_id,
    new.user_id,
    ((new.day_order - 1) % 7) + 1,
    ((new.day_order - 1) / 7) + 1
  );
  return new;
end;
$$;

revoke all on function private.seed_training_plan_schedule_entry()
from public, anon, authenticated;

insert into api.training_plan_schedule_entries (
  version_id,
  planned_session_id,
  user_id,
  weekday,
  slot_order
)
select
  session.version_id,
  session.session_id,
  session.user_id,
  ((session.day_order - 1) % 7) + 1,
  ((session.day_order - 1) / 7) + 1
from api.training_plan_sessions as session
on conflict (planned_session_id) do nothing;

create trigger training_plan_sessions_seed_schedule
after insert on api.training_plan_sessions
for each row
execute function private.seed_training_plan_schedule_entry();

create function private.rename_training_plan(
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
  if actor_user_id is null
    or (select auth.uid()) is distinct from actor_user_id
  then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if requested_plan_id is null
    or requested_name is null
    or char_length(btrim(requested_name)) not between 1 and 80
  then
    raise exception using errcode = '22023', message = 'Plan name is invalid.';
  end if;

  update api.training_plans as plan
  set
    name = btrim(requested_name),
    updated_at = statement_timestamp()
  where plan.plan_id = requested_plan_id
    and plan.user_id = actor_user_id
  returning plan.* into stored_plan;

  if not found then
    raise exception using errcode = '23514', message = 'Active plan was not found.';
  end if;

  return query select
    stored_plan.plan_id,
    stored_plan.name,
    stored_plan.updated_at;
end;
$$;

create function api.rename_training_plan(
  p_plan_id uuid,
  p_name text
)
returns table (
  plan_id uuid,
  plan_name text,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.rename_training_plan(
    (select auth.uid()),
    p_plan_id,
    p_name
  );
$$;

revoke all on function private.rename_training_plan(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function api.rename_training_plan(uuid, text)
from public, anon, authenticated;
grant execute on function api.rename_training_plan(uuid, text)
to authenticated;

create function private.cancel_training_session(
  actor_user_id uuid,
  requested_run_id uuid
)
returns table (
  cancelled_run_id uuid,
  was_cancelled boolean
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

  if requested_run_id is null then
    raise exception using errcode = '22023', message = 'Training cancellation command is invalid.';
  end if;

  delete from api.training_session_runs as run
  where run.run_id = requested_run_id
    and run.user_id = actor_user_id;

  if not found then
    raise exception using errcode = '23514', message = 'Active training was not found.';
  end if;

  return query select requested_run_id, true;
end;
$$;

create function api.cancel_training_session(p_run_id uuid)
returns table (
  run_id uuid,
  was_cancelled boolean
)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.cancel_training_session(
    (select auth.uid()),
    p_run_id
  );
$$;

revoke all on function private.cancel_training_session(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.cancel_training_session(uuid)
from public, anon, authenticated;
grant execute on function api.cancel_training_session(uuid)
to authenticated;

commit;
