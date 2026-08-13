import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repositoryRoot = process.cwd();
const mobileRoot = join(repositoryRoot, "apps", "mobile");
const packageManifest = JSON.parse(
  readFileSync(join(mobileRoot, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
};
const requiredDependencies = [
  "expo-crypto",
  "expo-secure-store",
  "expo-sqlite",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredDirectories = new Set([".expo", ".turbo", "dist", "node_modules"]);
const findings: string[] = [];
const appConfig = readFileSync(join(mobileRoot, "app.config.ts"), "utf8");

function listSourceFiles(directory: string): string[] {
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

for (const dependency of requiredDependencies) {
  if (!packageManifest.dependencies?.[dependency]) {
    findings.push(`missing required mobile dependency ${dependency}`);
  }
}

if (
  packageManifest.dependencies?.["@react-native-async-storage/async-storage"]
) {
  findings.push("unencrypted AsyncStorage is present in mobile dependencies");
}

for (const filePath of listSourceFiles(mobileRoot)) {
  const content = readFileSync(filePath, "utf8");
  if (
    /(?:from|require\s*\()\s*["']@react-native-async-storage\/async-storage/.test(
      content,
    )
  ) {
    findings.push(
      `${relative(repositoryRoot, filePath).replaceAll("\\", "/")}: unencrypted AsyncStorage import`,
    );
  }

  if (/\bdeleteDatabase(?:Async|Sync)\s*\(/.test(content)) {
    findings.push(
      `${relative(repositoryRoot, filePath).replaceAll("\\", "/")}: automatic local database deletion`,
    );
  }
}

if (!/useSQLCipher:\s*true/.test(appConfig)) {
  findings.push("Expo SQLite plugin does not enable SQLCipher");
}

if (!/configureAndroidBackup:\s*true/.test(appConfig)) {
  findings.push("Expo SecureStore backup exclusion is not configured");
}

if (!/allowBackup:\s*false/.test(appConfig)) {
  findings.push("Android application backup is not explicitly disabled");
}

const secureStoreDriver = readFileSync(
  join(mobileRoot, "lib", "security", "expo-secure-store-driver.ts"),
  "utf8",
);
if (!/WHEN_UNLOCKED_THIS_DEVICE_ONLY/.test(secureStoreDriver)) {
  findings.push("SecureStore values can migrate or be read while locked");
}

const databaseBootstrap = readFileSync(
  join(mobileRoot, "lib", "database", "local-database-bootstrap.ts"),
  "utf8",
);
if (!/PRAGMA cipher_version/.test(databaseBootstrap)) {
  findings.push(
    "local database bootstrap does not verify SQLCipher at runtime",
  );
}

if (findings.length > 0) {
  console.error("Unsafe mobile storage contract:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "Mobile persistence uses the approved SecureStore and SQLCipher dependencies.",
  );
}
