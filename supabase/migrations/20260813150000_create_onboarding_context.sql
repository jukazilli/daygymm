-- US-003: persist the minimum training context with resumable, owner-only access.
begin;

create table api.onboarding_contexts (
  user_id uuid primary key references api.profiles (user_id) on delete cascade,
  goal text,
  experience text,
  weekly_days smallint,
  session_minutes smallint,
  equipment_context text,
  limitation_status text,
  current_step smallint not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint onboarding_contexts_goal check (
    goal is null
    or goal in (
      'fat_loss',
      'hypertrophy',
      'strength',
      'conditioning',
      'health_return'
    )
  ),
  constraint onboarding_contexts_experience check (
    experience is null
    or experience in ('beginner', 'intermediate', 'advanced')
  ),
  constraint onboarding_contexts_weekly_days check (
    weekly_days is null or weekly_days between 2 and 5
  ),
  constraint onboarding_contexts_session_minutes check (
    session_minutes is null or session_minutes in (30, 45, 60, 75)
  ),
  constraint onboarding_contexts_equipment check (
    equipment_context is null
    or equipment_context in (
      'full_gym',
      'limited_gym',
      'home_equipment',
      'bodyweight'
    )
  ),
  constraint onboarding_contexts_limitation check (
    limitation_status is null
    or limitation_status in (
      'none',
      'not_informed',
      'needs_professional_review'
    )
  ),
  constraint onboarding_contexts_current_step check (
    current_step between 0 and 6
  ),
  constraint onboarding_contexts_progress_coherent check (
    (current_step < 1 or goal is not null)
    and (current_step < 2 or experience is not null)
    and (current_step < 3 or weekly_days is not null)
    and (current_step < 4 or session_minutes is not null)
    and (current_step < 5 or equipment_context is not null)
    and (current_step < 6 or limitation_status is not null)
  ),
  constraint onboarding_contexts_completion_coherent check (
    completed_at is null or current_step = 6
  )
);

comment on table api.onboarding_contexts is
  'Resumable minimum context used to select a training-plan path in US-003.';
comment on column api.onboarding_contexts.limitation_status is
  'Coarse safety-routing state only; no diagnosis or free-text health detail.';

alter table api.onboarding_contexts enable row level security;
alter table api.onboarding_contexts force row level security;

create policy onboarding_contexts_select_own
on api.onboarding_contexts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_contexts_insert_own
on api.onboarding_contexts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy onboarding_contexts_update_own
on api.onboarding_contexts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function private.normalize_onboarding_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();

  if tg_op = 'UPDATE' then
    new.current_step := greatest(old.current_step, new.current_step);
    if old.completed_at is not null then
      new.completed_at := old.completed_at;
    elsif new.completed_at is not null then
      new.completed_at := statement_timestamp();
    end if;
  elsif new.completed_at is not null then
    new.completed_at := statement_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_onboarding_context()
from public, anon, authenticated;

create trigger normalize_onboarding_context_before_write
before insert or update on api.onboarding_contexts
for each row execute function private.normalize_onboarding_context();

revoke all on table api.onboarding_contexts from public, anon, authenticated;
grant select on table api.onboarding_contexts to authenticated;
grant insert (
  user_id,
  goal,
  experience,
  weekly_days,
  session_minutes,
  equipment_context,
  limitation_status,
  current_step,
  completed_at
) on api.onboarding_contexts to authenticated;
grant update (
  goal,
  experience,
  weekly_days,
  session_minutes,
  equipment_context,
  limitation_status,
  current_step,
  completed_at
) on api.onboarding_contexts to authenticated;

create function api.save_onboarding_context(
  p_current_step smallint,
  p_goal text,
  p_experience text,
  p_weekly_days smallint,
  p_session_minutes smallint,
  p_equipment_context text,
  p_limitation_status text,
  p_confirmed boolean
)
returns api.onboarding_contexts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  stored_context api.onboarding_contexts%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_current_step not between 0 and 6
    or (p_goal is not null and p_goal not in (
      'fat_loss', 'hypertrophy', 'strength', 'conditioning', 'health_return'
    ))
    or (p_experience is not null and p_experience not in (
      'beginner', 'intermediate', 'advanced'
    ))
    or (p_weekly_days is not null and p_weekly_days not between 2 and 5)
    or (p_session_minutes is not null and p_session_minutes not in (30, 45, 60, 75))
    or (p_equipment_context is not null and p_equipment_context not in (
      'full_gym', 'limited_gym', 'home_equipment', 'bodyweight'
    ))
    or (p_limitation_status is not null and p_limitation_status not in (
      'none', 'not_informed', 'needs_professional_review'
    ))
    or (p_current_step >= 1 and p_goal is null)
    or (p_current_step >= 2 and p_experience is null)
    or (p_current_step >= 3 and p_weekly_days is null)
    or (p_current_step >= 4 and p_session_minutes is null)
    or (p_current_step >= 5 and p_equipment_context is null)
    or (p_current_step = 6 and p_limitation_status is null)
    or (p_confirmed and p_current_step <> 6)
  then
    raise exception using
      errcode = '23514',
      message = 'Onboarding context is invalid.';
  end if;

  insert into api.onboarding_contexts (
    user_id,
    goal,
    experience,
    weekly_days,
    session_minutes,
    equipment_context,
    limitation_status,
    current_step,
    completed_at
  )
  values (
    actor_id,
    p_goal,
    p_experience,
    p_weekly_days,
    p_session_minutes,
    p_equipment_context,
    p_limitation_status,
    p_current_step,
    case when p_confirmed then statement_timestamp() end
  )
  on conflict (user_id) do update
  set goal = coalesce(excluded.goal, onboarding_contexts.goal),
      experience = coalesce(excluded.experience, onboarding_contexts.experience),
      weekly_days = coalesce(excluded.weekly_days, onboarding_contexts.weekly_days),
      session_minutes = coalesce(
        excluded.session_minutes,
        onboarding_contexts.session_minutes
      ),
      equipment_context = coalesce(
        excluded.equipment_context,
        onboarding_contexts.equipment_context
      ),
      limitation_status = coalesce(
        excluded.limitation_status,
        onboarding_contexts.limitation_status
      ),
      current_step = greatest(
        excluded.current_step,
        onboarding_contexts.current_step
      ),
      completed_at = case
        when p_confirmed
          then coalesce(onboarding_contexts.completed_at, statement_timestamp())
        else onboarding_contexts.completed_at
      end
  returning * into stored_context;

  return stored_context;
end;
$$;

comment on function api.save_onboarding_context(
  smallint,
  text,
  text,
  smallint,
  smallint,
  text,
  text,
  boolean
) is 'Saves only the authenticated owner minimum onboarding context and supports resume and explicit confirmation.';

revoke all on function api.save_onboarding_context(
  smallint,
  text,
  text,
  smallint,
  smallint,
  text,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function api.save_onboarding_context(
  smallint,
  text,
  text,
  smallint,
  smallint,
  text,
  text,
  boolean
) to authenticated;

commit;
