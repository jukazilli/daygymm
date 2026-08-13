import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!process.env.SUPABASE_DB_URL_STAGING && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.SUPABASE_DB_URL_STAGING;

if (!databaseUrl) {
  console.error(
    "SUPABASE_DB_URL_STAGING is required. Supply it through a local ignored .env file or a GitHub secret.",
  );
  process.exit(1);
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runSupabase(argumentsList: string[]): void {
  const result = spawnSync(
    pnpmCommand,
    ["exec", "supabase", ...argumentsList],
    {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runSupabase(["db", "push", "--db-url", databaseUrl, "--yes"]);
runSupabase(["migration", "list", "--db-url", databaseUrl]);
runSupabase([
  "db",
  "lint",
  "--db-url",
  databaseUrl,
  "--schema",
  "api,platform,private",
  "--level",
  "error",
  "--fail-on",
  "error",
]);
runSupabase(["test", "db", "supabase/tests", "--db-url", databaseUrl]);
