import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repositoryRoot = process.cwd();
const ignoredDirectories = new Set([
  ".expo",
  ".next",
  "dist",
  "node_modules",
  "out",
]);
const sourceExtensions = new Set([".ts", ".tsx"]);
const allowedByApplication = new Map<string, ReadonlySet<string>>([
  [
    "apps/web",
    new Set([
      "NEXT_PUBLIC_DAYGYM_SITE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NODE_ENV",
    ]),
  ],
  [
    "apps/mobile",
    new Set([
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "EXPO_PUBLIC_SUPABASE_URL",
      "NODE_ENV",
    ]),
  ],
]);
const requiredVariables = new Set([
  "NEXT_PUBLIC_DAYGYM_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
]);
const referencedVariables = new Set<string>();
const findings: string[] = [];

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return [];
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return entry.isFile() && sourceExtensions.has(extname(entry.name))
      ? [entryPath]
      : [];
  });
}

for (const [application, allowedVariables] of allowedByApplication) {
  for (const filePath of listSourceFiles(join(repositoryRoot, application))) {
    const relativePath = relative(repositoryRoot, filePath).replaceAll(
      "\\",
      "/",
    );
    const content = readFileSync(filePath, "utf8");

    if (/process\.env\s*\[/.test(content)) {
      findings.push(`${relativePath}: dynamic process.env access`);
    }

    for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const variableName = match[1];
      if (!variableName) {
        continue;
      }

      referencedVariables.add(variableName);
      if (!allowedVariables.has(variableName)) {
        findings.push(
          `${relativePath}: disallowed client variable ${variableName}`,
        );
      }
    }

    if (/SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY|sb_secret_/i.test(content)) {
      findings.push(`${relativePath}: privileged Supabase key reference`);
    }

    if (/sb_publishable_[A-Za-z0-9._-]{16,}/.test(content)) {
      findings.push(`${relativePath}: hard-coded Supabase publishable key`);
    }
  }
}

for (const requiredVariable of requiredVariables) {
  if (!referencedVariables.has(requiredVariable)) {
    findings.push(
      `missing required client variable reference ${requiredVariable}`,
    );
  }
}

if (findings.length > 0) {
  console.error("Unsafe client environment contract:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Client environment exposes only the approved public variables.");
}
