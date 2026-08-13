-- US-004: persist one of four equivalent plan paths for a completed onboarding.
begin;

alter table api.onboarding_contexts
add column plan_source text,
add column plan_source_selected_at timestamptz,
add constraint onboarding_contexts_plan_source check (
  plan_source is null
  or plan_source in (
    'daygym_suggestion',
    'official_xlsx',
    'manual',
    'professional'
  )
),
add constraint onboarding_contexts_plan_source_coherent check (
  (plan_source is null and plan_source_selected_at is null)
  or (plan_source is not null and plan_source_selected_at is not null)
);

comment on column api.onboarding_contexts.plan_source is
  'User-selected path to a plan; replaceable until the first completed session.';
comment on column api.onboarding_contexts.plan_source_selected_at is
  'Server-normalized time of the latest allowed plan-source selection.';

create function private.guard_plan_source_selection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.plan_source is not distinct from old.plan_source then
    new.plan_source_selected_at := old.plan_source_selected_at;
    return new;
  end if;

  if new.plan_source is null or old.completed_at is null then
    raise exception using
      errcode = '23514',
      message = 'A completed onboarding context is required.';
  end if;

  if exists (
    select 1
    from api.training_sessions as session
    where session.user_id = old.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'The plan source is locked after the first session.';
  end if;

  new.plan_source_selected_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function private.guard_plan_source_selection()
from public, anon, authenticated;

create trigger guard_plan_source_selection_before_update
before update of plan_source, plan_source_selected_at
on api.onboarding_contexts
for each row execute function private.guard_plan_source_selection();

grant update (plan_source) on api.onboarding_contexts to authenticated;

create function api.select_plan_source(p_plan_source text)
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

  if p_plan_source is null or p_plan_source not in (
    'daygym_suggestion',
    'official_xlsx',
    'manual',
    'professional'
  ) then
    raise exception using
      errcode = '23514',
      message = 'The plan source is invalid.';
  end if;

  update api.onboarding_contexts
  set plan_source = p_plan_source
  where user_id = actor_id
  returning * into stored_context;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'A completed onboarding context is required.';
  end if;

  return stored_context;
end;
$$;

comment on function api.select_plan_source(text) is
  'Selects or replaces the authenticated owner plan path before the first session.';

revoke all on function api.select_plan_source(text)
from public, anon, authenticated;
grant execute on function api.select_plan_source(text) to authenticated;

commit;
