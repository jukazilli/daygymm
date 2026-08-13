-- FND-022: private transactional outbox and durable domain event queue.
begin;

create extension if not exists pgmq;

create schema if not exists platform;

revoke all on schema platform from public, anon, authenticated;
revoke all on schema pgmq from public, anon, authenticated;

alter default privileges for role postgres in schema platform
revoke all on tables from public;
alter default privileges for role postgres in schema platform
revoke all on sequences from public;
alter default privileges for role postgres in schema platform
revoke execute on functions from public;

select pgmq.create('domain_events');

revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;
revoke all on all functions in schema pgmq from public, anon, authenticated;

create table platform.job_outbox (
  event_id uuid primary key,
  event_name text not null,
  event_version smallint not null,
  event_envelope jsonb not null,
  occurred_at timestamptz not null,
  correlation_id uuid not null,
  producer text not null,
  available_at timestamptz not null default statement_timestamp(),
  dispatched_at timestamptz,
  queue_message_id bigint unique,
  created_at timestamptz not null default statement_timestamp(),
  constraint job_outbox_event_version check (event_version = 1),
  constraint job_outbox_event_name check (
    event_name in (
      'TrainingSessionCompleted',
      'PlanVersionPublished',
      'ProfessionalAccessRevoked',
      'RewardGranted',
      'ModerationCaseOpened',
      'PartnerOfferChanged'
    )
  ),
  constraint job_outbox_producer check (
    char_length(producer) between 1 and 80
    and producer ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint job_outbox_envelope_object check (
    jsonb_typeof(event_envelope) = 'object'
  ),
  constraint job_outbox_dispatch_pair check (
    (dispatched_at is null and queue_message_id is null)
    or (dispatched_at is not null and queue_message_id is not null)
  )
);

create index job_outbox_pending_idx
on platform.job_outbox (available_at, created_at)
where dispatched_at is null;

comment on table platform.job_outbox is
  'Private transactional outbox for approved versioned domain events.';
comment on column platform.job_outbox.event_envelope is
  'Minimal validated event envelope; application roles never receive direct access.';

revoke all on table platform.job_outbox from public, anon, authenticated;

create function private.enqueue_domain_event(event_envelope jsonb)
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
      'event_id',
      'event_name',
      'event_version',
      'occurred_at',
      'correlation_id',
      'producer',
      'payload'
    ]
    or event_envelope - array[
      'event_id',
      'event_name',
      'event_version',
      'occurred_at',
      'correlation_id',
      'producer',
      'payload'
    ] <> '{}'::jsonb
    or jsonb_typeof(event_envelope -> 'payload') is distinct from 'object'
  then
    raise exception using
      errcode = '23514',
      message = 'Domain event envelope is invalid.';
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
      raise exception using
        errcode = '23514',
        message = 'Domain event envelope is invalid.';
  end;

  if event_envelope ->> 'occurred_at' !~ 'Z$' then
    raise exception using
      errcode = '23514',
      message = 'Domain event timestamp must use UTC.';
  end if;

  if event_version_value <> 1
    or event_name_value not in (
      'TrainingSessionCompleted',
      'PlanVersionPublished',
      'ProfessionalAccessRevoked',
      'RewardGranted',
      'ModerationCaseOpened',
      'PartnerOfferChanged'
    )
    or char_length(producer_value) not between 1 and 80
    or producer_value !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  then
    raise exception using
      errcode = '23514',
      message = 'Domain event envelope is invalid.';
  end if;

  insert into platform.job_outbox (
    event_id,
    event_name,
    event_version,
    event_envelope,
    occurred_at,
    correlation_id,
    producer
  )
  values (
    event_id_value,
    event_name_value,
    event_version_value,
    event_envelope,
    occurred_at_value,
    correlation_id_value,
    producer_value
  )
  on conflict (event_id) do nothing;

  select outbox.event_envelope
  into stored_envelope
  from platform.job_outbox as outbox
  where outbox.event_id = event_id_value;

  if stored_envelope is distinct from event_envelope then
    raise exception using
      errcode = '23505',
      message = 'Domain event identifier was reused with different content.';
  end if;

  return event_id_value;
end;
$$;

comment on function private.enqueue_domain_event(jsonb) is
  'Adds one approved event to the private outbox and deduplicates exact replay.';

revoke all on function private.enqueue_domain_event(jsonb)
from public, anon, authenticated;

create function private.dispatch_domain_events(batch_size integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  message_id bigint;
  dispatched integer := 0;
begin
  if batch_size < 1 or batch_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Outbox batch size must be between 1 and 100.';
  end if;

  for candidate in
    select outbox.event_id, outbox.event_envelope
    from platform.job_outbox as outbox
    where outbox.dispatched_at is null
      and outbox.available_at <= statement_timestamp()
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit batch_size
  loop
    message_id := pgmq.send(
      queue_name => 'domain_events',
      msg => candidate.event_envelope
    );

    update platform.job_outbox
    set
      dispatched_at = statement_timestamp(),
      queue_message_id = message_id
    where event_id = candidate.event_id;

    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;

comment on function private.dispatch_domain_events(integer) is
  'Atomically publishes undispatched outbox events to pgmq with row locking.';

revoke all on function private.dispatch_domain_events(integer)
from public, anon, authenticated;

commit;
