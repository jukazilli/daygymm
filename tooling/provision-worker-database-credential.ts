import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import postgres from "postgres";

if (!process.env.SUPABASE_DB_URL_STAGING && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const administratorUrl = process.env.SUPABASE_DB_URL_STAGING;
if (!administratorUrl) {
  fail("SUPABASE_DB_URL_STAGING is required through the ignored local .env.");
}

const administrator = parseAdministratorUrl(administratorUrl);
const password = randomBytes(48).toString("base64url");
const sql = postgres(administrator.toString(), {
  connect_timeout: 10,
  fetch_types: false,
  idle_timeout: 5,
  max: 1,
  onnotice: () => undefined,
  prepare: false,
  ssl: "require",
});

try {
  const role = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from pg_roles
      where rolname = 'daygym_worker_runtime'
    ) as exists
  `;
  if (role[0]?.exists !== true) {
    fail("Worker runtime role is missing; apply versioned migrations first.");
  }

  const statement = await sql<{ value: string }[]>`
    select format(
      'alter role daygym_worker_runtime with login password %L',
      ${password}::text
    ) as value
  `;
  if (!statement[0]?.value) {
    fail("Could not build the worker credential rotation statement.");
  }
  await sql.unsafe(statement[0].value);
} finally {
  await sql.end({ timeout: 5 });
}

const runtimeUrl = new URL(administrator);
runtimeUrl.username = workerUsername(administrator.username);
runtimeUrl.password = password;

const gcloudCommand = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
const result = spawnSync(
  gcloudCommand,
  [
    "secrets",
    "versions",
    "add",
    "daygym-database-url",
    "--project=pex-gsc",
    "--data-file=-",
    "--quiet",
  ],
  {
    encoding: "utf8",
    input: runtimeUrl.toString(),
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  fail("Secret Manager rejected the worker credential version.");
}

console.log(
  "Worker database credential rotated and stored in Secret Manager without logging its value.",
);

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
    fail(
      "SUPABASE_DB_URL_STAGING is not the expected staging administrator URL.",
    );
  }

  return url;
}

function workerUsername(administratorUsername: string): string {
  const separator = administratorUsername.indexOf(".");
  return separator === -1
    ? "daygym_worker_runtime"
    : `daygym_worker_runtime${administratorUsername.slice(separator)}`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
