import { existsSync } from "node:fs";

import postgres from "postgres";

if (!process.env.SUPABASE_DB_URL_STAGING && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.SUPABASE_DB_URL_STAGING;
const diagnosticEmail = process.env.DAYGYM_DIAGNOSTIC_EMAIL;

if (!databaseUrl || !diagnosticEmail) {
  throw new Error(
    "SUPABASE_DB_URL_STAGING and DAYGYM_DIAGNOSTIC_EMAIL are required.",
  );
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const [identity] = await sql<
    Array<{
      confirmed_at: Date | null;
      confirmation_sent_at: Date | null;
      created_at: Date;
      id: string;
      last_sign_in_at: Date | null;
      recovery_sent_at: Date | null;
      updated_at: Date;
    }>
  >`
    select id, confirmed_at, confirmation_sent_at, created_at,
      last_sign_in_at, recovery_sent_at, updated_at
    from auth.users
    where lower(email) = lower(${diagnosticEmail})
    limit 1
  `;
  if (!identity) {
    console.log(JSON.stringify({ identity: "absent" }));
  } else {
    const [eligibility] = await sql<
      Array<{
        consent_count: number;
        profile_count: number;
      }>
    >`
      select
        (select count(*)::int from api.profiles where user_id = ${identity.id})
          as profile_count,
        (select count(*)::int from api.consents where user_id = ${identity.id})
          as consent_count
    `;
    const audit = await sql`
      select
        created_at,
        payload::jsonb ->> 'action' as action,
        payload::jsonb ->> 'log_type' as log_type
      from auth.audit_log_entries
      where payload::text like ${`%${identity.id}%`}
      order by created_at desc
      limit 20
    `;
    const auditKeys = await sql`
      select distinct jsonb_object_keys(payload::jsonb) as key
      from auth.audit_log_entries
      where created_at >= now() - interval '24 hours'
      order by key
    `;
    const [identityHealth] = await sql<
      Array<{
        incomplete_identity_count: number;
        missing_consent_count: number;
        missing_profile_count: number;
      }>
    >`
      select
        count(*) filter (where profile.user_id is null)::int
          as missing_profile_count,
        count(*) filter (where coalesce(consent.document_count, 0) < 2)::int
          as missing_consent_count,
        count(*) filter (
          where profile.user_id is null
            or coalesce(consent.document_count, 0) < 2
        )::int as incomplete_identity_count
      from auth.users as identity
      left join api.profiles as profile on profile.user_id = identity.id
      left join lateral (
        select count(distinct document)::int as document_count
        from api.consents
        where user_id = identity.id
          and document in ('terms_of_service', 'privacy_notice')
      ) as consent on true
      where identity.deleted_at is null
    `;
    const completedSets = await sql`
      select completed_at, revision, set_number, updated_at
      from api.training_session_run_sets
      where user_id = ${identity.id}
      order by completed_at desc
      limit 10
    `;
    const planVersions = await sql`
      select version_number, origin, change_summary, created_at
      from api.training_plan_versions
      where user_id = ${identity.id}
      order by created_at desc
      limit 10
    `;

    console.log(
      JSON.stringify({
        audit,
        auditKeys,
        completedSets,
        eligibility,
        identityHealth,
        planVersions,
        identity: {
          confirmedAt: identity.confirmed_at,
          confirmationSentAt: identity.confirmation_sent_at,
          createdAt: identity.created_at,
          lastSignInAt: identity.last_sign_in_at,
          recoverySentAt: identity.recovery_sent_at,
          updatedAt: identity.updated_at,
        },
      }),
    );
  }
} finally {
  await sql.end();
}
