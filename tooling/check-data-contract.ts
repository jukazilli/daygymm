import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const contractPath = join(
  repositoryRoot,
  "docs",
  "data",
  "data-dictionary-and-rls.md",
);
const findings: string[] = [];
const tables = new Set<string>();
const policies = new Set<string>();

for (const file of readdirSync(migrationsDirectory).sort()) {
  if (!file.endsWith(".sql")) continue;

  const migration = readFileSync(join(migrationsDirectory, file), "utf8");

  for (const match of migration.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(api|platform|private)\.([a-z_][a-z0-9_]*)/gi,
  )) {
    tables.add(`${match[1]?.toLowerCase()}.${match[2]?.toLowerCase()}`);
  }

  for (const match of migration.matchAll(
    /create\s+policy\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    if (match[1]) policies.add(match[1].toLowerCase());
  }

  for (const match of migration.matchAll(
    /drop\s+policy(?:\s+if\s+exists)?\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    if (match[1]) policies.delete(match[1].toLowerCase());
  }
}

const contract = readFileSync(contractPath, "utf8");
const tests = readdirSync(join(repositoryRoot, "supabase", "tests"))
  .filter((file) => file.endsWith(".test.sql"))
  .map((file) =>
    readFileSync(join(repositoryRoot, "supabase", "tests", file), "utf8"),
  )
  .join("\n");
const testIds = [...tests.matchAll(/^-- (RLS-N\d+):/gm)]
  .map((match) => match[1])
  .filter((id): id is string => Boolean(id));

for (const table of tables) {
  if (!contract.includes(`\`${table}\``)) {
    findings.push(`missing canonical table in data dictionary: ${table}`);
    continue;
  }

  const heading = `### \`${table}\``;
  const sectionStart = contract.indexOf(heading) + heading.length;
  const remainingContract = contract.slice(sectionStart);
  const nextHeading = remainingContract.search(/\n#{2,3} /);
  const section = remainingContract.slice(
    0,
    nextHeading === -1 ? undefined : nextHeading,
  );
  if (!section?.includes("Owner:") || !section.includes("Finalidade:")) {
    findings.push(`table section must declare owner and purpose: ${table}`);
  }
}

for (const policy of policies) {
  const matrixRow = contract
    .split(/\r?\n/)
    .find((line) => line.includes(`\`${policy}\``));
  if (!matrixRow) {
    findings.push(`missing active policy in RLS matrix: ${policy}`);
  } else if (!/`RLS-N\d+`/.test(matrixRow)) {
    findings.push(`active policy has no mapped negative test: ${policy}`);
  }
}

for (const id of testIds) {
  if (!contract.includes(`\`${id}\``)) {
    findings.push(`negative test is not mapped in RLS matrix: ${id}`);
  }
}

if (new Set(testIds).size !== testIds.length) {
  findings.push("negative RLS test identifiers must be unique");
}

if (!contract.includes("`auth.users`")) {
  findings.push("Supabase Auth ownership boundary is not documented");
}

if (findings.length > 0) {
  console.error("Data contract violations:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    `Data contract verified: ${tables.size} canonical tables, ${policies.size} active RLS policies, ${testIds.length} negative controls.`,
  );
}
