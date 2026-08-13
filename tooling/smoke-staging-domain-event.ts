import { existsSync } from "node:fs";

import postgres from "postgres";

if (!process.env.SUPABASE_DB_URL_STAGING && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.SUPABASE_DB_URL_STAGING;
if (!databaseUrl) {
  fail("SUPABASE_DB_URL_STAGING is required through the ignored local .env.");
}

const administrator = parseAdministratorUrl(databaseUrl);
const sql = postgres(administrator.toString(), {
  connect_timeout: 10,
  fetch_types: false,
  idle_timeout: 5,
  max: 1,
  onnotice: () => undefined,
  prepare: false,
  ssl: "require",
});

const fixture = {
  completedAt: "2026-08-13T18:30:00.000000Z",
  correlationId: "fd220000-0000-4000-8000-000000000004",
  email: "fnd-022-worker-smoke@daygym.invalid",
  eventId: "fd220000-0000-4000-8000-000000000003",
  operationId: "fnd-022-worker-smoke-v1",
  sessionId: "fd220000-0000-4000-8000-000000000002",
  userId: "fd220000-0000-4000-8000-000000000001",
} as const;

try {
  await ensureSyntheticUser();
  await enqueueCompletion();
  const evidence = await waitForConsumption();
  console.log(JSON.stringify(evidence));
} finally {
  await sql.end({ timeout: 5 });
}

async function ensureSyntheticUser(): Promise<void> {
  await sql`
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      ${fixture.userId}::uuid,
      'authenticated',
      'authenticated',
      ${fixture.email},
      ${sql.json({
        daygym_account_creation: "v1",
        daygym_is_adult: true,
        daygym_privacy_version: "2026-08-13",
        daygym_terms_version: "2026-08-13",
      })}::jsonb
    )
    on conflict (id) do nothing
  `;

  const profiles = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from api.profiles
      where user_id = ${fixture.userId}::uuid
    ) as exists
  `;
  if (profiles[0]?.exists !== true) {
    fail("The synthetic staging profile could not be established.");
  }
}

async function enqueueCompletion(): Promise<void> {
  const result = await sql<{ event_id: string }[]>`
    select completion_event_id::text as event_id
    from private.complete_training_session(
      ${fixture.sessionId}::uuid,
      ${fixture.userId}::uuid,
      ${fixture.operationId},
      ${fixture.completedAt}::timestamptz,
      1,
      ${fixture.eventId}::uuid,
      ${fixture.correlationId}::uuid
    )
  `;

  if (result[0]?.event_id !== fixture.eventId) {
    fail("The staging completion command returned unexpected canonical state.");
  }
}

async function waitForConsumption(): Promise<SmokeEvidence> {
  const deadline = Date.now() + 150_000;

  while (Date.now() < deadline) {
    const [state] = await sql<SmokeState[]>`
      select
        outbox.dispatched_at is not null as dispatched,
        session.completion_consumed_at is not null as consumed,
        exists (
          select 1
          from platform.domain_event_receipts as receipt
          where receipt.consumer_name = 'training.completion.v1'
            and receipt.event_id = ${fixture.eventId}::uuid
        ) as receipt,
        not exists (
          select 1
          from pgmq.q_domain_events as queue
          where queue.msg_id = outbox.queue_message_id
        ) as absent_from_live_queue
      from api.training_sessions as session
      join platform.job_outbox as outbox
        on outbox.event_id = session.completion_event_id
      where session.session_id = ${fixture.sessionId}::uuid
    `;

    if (
      state?.dispatched === true &&
      state.consumed === true &&
      state.receipt === true &&
      state.absent_from_live_queue === true
    ) {
      return {
        archived: true,
        canonical: true,
        consumed: true,
        dispatched: true,
        receipt: true,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  fail(
    "The staging worker did not consume the synthetic event within 150 seconds.",
  );
}

function parseAdministratorUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail("SUPABASE_DB_URL_STAGING is not a valid URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".supabase.com") ||
    !url.username.startsWith("postgres") ||
    !url.password
  ) {
    fail("SUPABASE_DB_URL_STAGING is not the expected administrator URL.");
  }

  return url;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

interface SmokeState {
  absent_from_live_queue: boolean;
  consumed: boolean;
  dispatched: boolean;
  receipt: boolean;
}

interface SmokeEvidence {
  archived: true;
  canonical: true;
  consumed: true;
  dispatched: true;
  receipt: true;
}
