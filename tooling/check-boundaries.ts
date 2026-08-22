import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();
const workspaceDirectories = ["apps", "packages"];
const publicPackages = new Set([
  "@daygym/contracts",
  "@daygym/design-tokens",
  "@daygym/domain",
  "@daygym/training-runtime",
]);
const errors: string[] = [];

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }

    return entry.isFile() ? [entryPath] : [];
  });
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function isPinnedDependency(version: string): boolean {
  return (
    version === "workspace:*" || /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)
  );
}

function inspectManifest(manifestPath: string): void {
  const manifest = readJson(manifestPath);
  const packageName = String(manifest.name ?? manifestPath);
  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ] as const;

  for (const section of sections) {
    const dependencies = manifest[section];
    if (!dependencies || typeof dependencies !== "object") {
      continue;
    }

    for (const [dependency, version] of Object.entries(dependencies)) {
      if (typeof version !== "string" || !isPinnedDependency(version)) {
        errors.push(
          `${packageName}: ${dependency} must use an exact or workspace:* version.`,
        );
      }
    }
  }

  if (packageName === "@daygym/domain" && manifest.dependencies) {
    errors.push("@daygym/domain must not declare runtime dependencies.");
  }

  if (publicPackages.has(packageName)) {
    const exports = manifest.exports;
    if (!exports || typeof exports !== "object" || !("." in exports)) {
      errors.push(
        `${packageName}: public packages must declare the root export only.`,
      );
    }
  }
}

function inspectImports(sourcePath: string): void {
  const source = readFileSync(sourcePath, "utf8");
  const relativePath = relative(repositoryRoot, sourcePath);
  const isDomainSource = relativePath
    .replaceAll("\\", "/")
    .startsWith("packages/domain/src/");
  const importExpression = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(importExpression)) {
    const specifier = match[1];
    if (!specifier) {
      continue;
    }

    if (/^@daygym\/[^/]+\//.test(specifier)) {
      errors.push(
        `${relativePath}: deep workspace import '${specifier}' is forbidden.`,
      );
    }

    if (
      isDomainSource &&
      /^(?:@supabase\/|next(?:\/|$)|expo(?:\/|$)|react(?:-native)?(?:\/|$)|node:)/.test(
        specifier,
      )
    ) {
      errors.push(`${relativePath}: domain code cannot import '${specifier}'.`);
    }
  }
}

for (const workspaceDirectory of workspaceDirectories) {
  const workspacePath = join(repositoryRoot, workspaceDirectory);
  for (const sourcePath of listFiles(workspacePath)) {
    if (sourcePath.endsWith("package.json")) {
      inspectManifest(sourcePath);
    }
    if (/\.(?:ts|tsx)$/.test(sourcePath) && !sourcePath.endsWith(".test.ts")) {
      inspectImports(sourcePath);
    }
  }
}

if (errors.length > 0) {
  console.error("Boundary verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Boundary verification passed.");
}
