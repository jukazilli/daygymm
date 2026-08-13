import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface EasConfig {
  readonly cli?: { readonly version?: string };
  readonly build?: Readonly<
    Record<string, { readonly node?: string; readonly pnpm?: string }>
  >;
}

const repositoryRoot = process.cwd();
const findings: string[] = [];
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readText(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8").trim();
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

function packageManifestPaths(): string[] {
  const paths = ["package.json"];

  for (const parent of ["apps", "packages"]) {
    for (const entry of readdirSync(join(repositoryRoot, parent), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        paths.push(`${parent}/${entry.name}/package.json`);
      }
    }
  }

  return paths;
}

function assertEqual(
  label: string,
  observed: string | undefined,
  expected: string,
): void {
  if (observed !== expected) {
    findings.push(
      `${label}: expected ${expected}, found ${observed ?? "missing"}`,
    );
  }
}

const rootManifest = readJson<PackageManifest>("package.json");
const packageManager = rootManifest.packageManager?.match(
  /^pnpm@(\d+\.\d+\.\d+)$/,
);

if (!packageManager?.[1]) {
  findings.push("package.json: packageManager must pin an exact pnpm version");
}

const pnpmVersion = packageManager?.[1] ?? "";
const nodeVersion = rootManifest.engines?.node ?? "";

if (!exactVersion.test(nodeVersion)) {
  findings.push("package.json: engines.node must pin an exact Node.js version");
}

assertEqual(
  "package.json engines.pnpm",
  rootManifest.engines?.pnpm,
  pnpmVersion,
);
assertEqual(".nvmrc", readText(".nvmrc"), nodeVersion);
assertEqual("running Node.js", process.versions.node, nodeVersion);

const userAgent = process.env.npm_config_user_agent;
if (userAgent) {
  const runningPnpm = userAgent.match(/pnpm\/(\d+\.\d+\.\d+)/)?.[1];
  assertEqual("running pnpm", runningPnpm, pnpmVersion);
}

const npmConfig = readText(".npmrc");
for (const requiredSetting of ["engine-strict=true", "save-exact=true"]) {
  if (!npmConfig.split(/\r?\n/).includes(requiredSetting)) {
    findings.push(`.npmrc: missing ${requiredSetting}`);
  }
}

let dependencyCount = 0;
for (const path of packageManifestPaths()) {
  const manifest = readJson<PackageManifest>(path);
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      dependencyCount += 1;
      if (version === "workspace:*") {
        continue;
      }

      if (!exactVersion.test(version)) {
        findings.push(
          `${path} ${section}.${name}: version is not exact (${version})`,
        );
      }
    }
  }
}

const workflow = readText(".github/workflows/ci.yml");
const workflowNodeVersions = [
  ...workflow.matchAll(/node-version:\s*["']?([^\s"'#]+)["']?/g),
]
  .map((match) => match[1])
  .filter((version): version is string => Boolean(version));
const workflowPnpmVersions = [
  ...workflow.matchAll(/corepack prepare pnpm@(\d+\.\d+\.\d+) --activate/g),
]
  .map((match) => match[1])
  .filter((version): version is string => Boolean(version));

if (workflowNodeVersions.length === 0) {
  findings.push("ci.yml: no pinned Node.js setup found");
}
for (const version of workflowNodeVersions) {
  assertEqual("ci.yml node-version", version, nodeVersion);
}

if (workflowPnpmVersions.length === 0) {
  findings.push("ci.yml: no pinned pnpm activation found");
}
for (const version of workflowPnpmVersions) {
  assertEqual("ci.yml pnpm", version, pnpmVersion);
}

const eas = readJson<EasConfig>("apps/mobile/eas.json");
if (!eas.cli?.version || !exactVersion.test(eas.cli.version)) {
  findings.push("apps/mobile/eas.json: cli.version must be exact");
}
for (const [profile, config] of Object.entries(eas.build ?? {})) {
  assertEqual(`EAS ${profile} Node.js`, config.node, nodeVersion);
  if (config.pnpm) {
    assertEqual(`EAS ${profile} pnpm`, config.pnpm, pnpmVersion);
  }
}

const dockerfile = readText("apps/api/Dockerfile");
const dockerNodeVersions = [...dockerfile.matchAll(/^FROM node:([^\s]+).*$/gm)]
  .map((match) => match[1])
  .filter((version): version is string => Boolean(version));
const dockerPnpmVersions = [...dockerfile.matchAll(/pnpm@(\d+\.\d+\.\d+)/g)]
  .map((match) => match[1])
  .filter((version): version is string => Boolean(version));

if (dockerNodeVersions.length === 0) {
  findings.push("apps/api/Dockerfile: no Node.js base image found");
}
for (const version of dockerNodeVersions) {
  if (version !== nodeVersion && !version.startsWith(`${nodeVersion}-`)) {
    findings.push(
      `apps/api/Dockerfile Node.js: expected ${nodeVersion}, found ${version}`,
    );
  }
}

if (dockerPnpmVersions.length === 0) {
  findings.push("apps/api/Dockerfile: no pinned pnpm installation found");
}
for (const version of dockerPnpmVersions) {
  assertEqual("apps/api/Dockerfile pnpm", version, pnpmVersion);
}

if (!readText("pnpm-lock.yaml").startsWith('lockfileVersion: "9.0"')) {
  findings.push(
    "pnpm-lock.yaml: lockfile version is not compatible with pnpm 9",
  );
}

if (findings.length > 0) {
  console.error("Toolchain contract violations:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Toolchain contract verified: Node.js ${nodeVersion}, pnpm ${pnpmVersion}, ${dependencyCount} exact dependency declarations.`,
  );
}
