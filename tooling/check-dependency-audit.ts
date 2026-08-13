import { spawnSync } from "node:child_process";

type AuditAdvisory = {
  module_name: string;
  severity: string;
  title: string;
  url: string;
};

type AuditResult = {
  advisories?: Record<string, AuditAdvisory>;
};

const exceptions = new Map([
  [
    "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
    {
      expiresOn: "2026-09-12",
      issue: "docs/security/dependency-exceptions.md#expo-metro-image-size",
    },
  ],
  [
    "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
    {
      expiresOn: "2026-09-12",
      issue: "docs/security/dependency-exceptions.md#expo-metro-image-size",
    },
  ],
]);

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const audit = spawnSync(command, ["audit", "--prod", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  // pnpm repeats every transitive path in its JSON report. Expo's graph can
  // exceed Node's 1 MiB child-process default even when only a few advisories
  // exist, which previously truncated valid JSON and produced a false failure.
  maxBuffer: 50 * 1024 * 1024,
  shell: process.platform === "win32",
});

if (!audit.stdout) {
  console.error(
    audit.stderr ||
      audit.error?.message ||
      "The dependency audit did not return JSON output.",
  );
  process.exit(1);
}

let result: AuditResult;
try {
  result = JSON.parse(audit.stdout) as AuditResult;
} catch {
  console.error("The dependency audit returned invalid JSON.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const blocking = Object.values(result.advisories ?? []).filter((advisory) => {
  if (advisory.severity !== "high" && advisory.severity !== "critical") {
    return false;
  }

  const exception = exceptions.get(advisory.url);
  return !exception || exception.expiresOn < today;
});

const allowed = Object.values(result.advisories ?? []).filter((advisory) =>
  exceptions.has(advisory.url),
);

for (const advisory of allowed) {
  const exception = exceptions.get(advisory.url);
  console.warn(
    `Temporary exception: ${advisory.module_name} (${advisory.url}) until ${exception?.expiresOn}; see ${exception?.issue}.`,
  );
}

if (blocking.length > 0) {
  console.error("Blocking production dependency advisories:");
  for (const advisory of blocking) {
    console.error(
      `- ${advisory.severity}: ${advisory.module_name} — ${advisory.url}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    "No unapproved high or critical production dependency advisory was found.",
  );
}
