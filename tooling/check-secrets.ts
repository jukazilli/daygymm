import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();
const scanDirectories = [".github", "apps", "packages", "supabase", "tooling"];
const generatedDirectoryNames = new Set([
  ".expo",
  ".next",
  ".turbo",
  "dist",
  "node_modules",
]);
const findings: string[] = [];
const secretPatterns = [
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9._-]{20,}/g },
  {
    label: "privileged Supabase environment value",
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s"']{8,}/g,
  },
];

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (generatedDirectoryNames.has(entry.name)) {
        return [];
      }
      return listFiles(entryPath);
    }

    return entry.isFile() ? [entryPath] : [];
  });
}

for (const scanDirectory of scanDirectories) {
  for (const filePath of listFiles(join(repositoryRoot, scanDirectory))) {
    const content = readFileSync(filePath, "utf8");
    for (const { label, pattern } of secretPatterns) {
      if (pattern.test(content)) {
        findings.push(`${relative(repositoryRoot, filePath)}: ${label}`);
      }
      pattern.lastIndex = 0;
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("No tracked-source secret pattern was found.");
}
