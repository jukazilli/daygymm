import { readFileSync } from "node:fs";
import { URL } from "node:url";

import { describe, expect, it } from "vitest";

import appConfig, { getAppVariant, resolveAppVariant } from "../app.config";
import appVariants from "./app-variants.json";

interface EasBuildProfile {
  android?: {
    buildType: "apk" | "app-bundle";
  };
  autoIncrement?: boolean;
  channel: string;
  developmentClient?: boolean;
  distribution: "internal" | "store";
  environment: string;
  env: {
    APP_VARIANT: string;
  };
  node: string;
}

interface EasConfig {
  cli: {
    appVersionSource: string;
    version: string;
  };
  build: Record<string, EasBuildProfile>;
}

interface MobilePackageConfig {
  scripts: Record<string, string>;
}

describe("mobile app variants", () => {
  it("defaults safely to development", () => {
    expect(resolveAppVariant()).toBe("development");
    expect(resolveAppVariant("")).toBe("development");
  });

  it("keeps install identifiers and deep-link schemes isolated", () => {
    const definitions = Object.values(appVariants);

    expect(new Set(definitions.map(({ identifier }) => identifier)).size).toBe(
      definitions.length,
    );
    expect(new Set(definitions.map(({ scheme }) => scheme)).size).toBe(
      definitions.length,
    );
  });

  it.each([
    ["development", "daygym-development://auth/callback"],
    ["preview", "daygym-preview://auth/callback"],
    ["production", "daygym://auth/callback"],
  ] as const)("defines the %s auth callback", (variant, callback) => {
    expect(getAppVariant(variant).authCallback).toBe(callback);
  });

  it("rejects an unknown variant", () => {
    expect(() => resolveAppVariant("staging")).toThrow(
      'Invalid APP_VARIANT "staging"',
    );
  });

  it("enables SecureStore and SQLCipher in every native build", () => {
    const config = appConfig({
      config: { name: "DayGym", slug: "daygym" },
      packageJsonPath: null,
      projectRoot: "C:/daygym/apps/mobile",
      staticConfigPath: null,
    });

    expect(config.plugins).toContainEqual([
      "expo-secure-store",
      { configureAndroidBackup: true },
    ]);
    expect(config.plugins).toContainEqual([
      "expo-sqlite",
      { useSQLCipher: true },
    ]);
    expect(config.android?.allowBackup).toBe(false);
  });

  it("links the canonical Expo project and icon", () => {
    const config = appConfig({
      config: { name: "DayGym", slug: "daygym" },
      packageJsonPath: null,
      projectRoot: "C:/daygym/apps/mobile",
      staticConfigPath: null,
    });

    expect(config.owner).toBe("soberania-tech");
    expect(config.slug).toBe("daygym");
    expect(config.icon).toBe("./assets/icon.png");
    expect(config.extra?.eas).toEqual({
      projectId: "5875a3a9-584b-4987-8086-cf110fbbf168",
    });
  });
});

describe("EAS profiles", () => {
  const easConfig = JSON.parse(
    readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
  ) as EasConfig;

  it("pins the toolchain and remote app-version source", () => {
    expect(easConfig.cli).toEqual({
      version: "21.8.0",
      appVersionSource: "remote",
    });
  });

  it.each(["development", "preview", "production"] as const)(
    "isolates the %s profile and channel",
    (variant) => {
      const profile = easConfig.build[variant];

      expect(profile).toBeDefined();
      expect(profile?.environment).toBe(variant);
      expect(profile?.channel).toBe(variant);
      expect(profile?.env.APP_VARIANT).toBe(variant);
      expect(profile?.node).toBe("22.12.0");
    },
  );

  it("uses a development client only for local development", () => {
    expect(easConfig.build.development?.developmentClient).toBe(true);
    expect(easConfig.build.development?.distribution).toBe("internal");
    expect(easConfig.build.preview?.developmentClient).toBeUndefined();
    expect(easConfig.build.production?.developmentClient).toBeUndefined();
    expect(easConfig.build.production?.distribution).toBe("store");
    expect(easConfig.build.production?.autoIncrement).toBe(true);
  });

  it("produces a directly installable Android preview APK", () => {
    expect(easConfig.build.preview?.android).toEqual({
      buildType: "apk",
    });
    expect(easConfig.build.production?.android).toBeUndefined();
  });
});

describe("EAS monorepo bootstrap", () => {
  const packageConfig = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as MobilePackageConfig;

  it("builds workspace dependencies after a clean remote install", () => {
    expect(packageConfig.scripts.postinstall).toBe("pnpm build:workspace-deps");
    expect(packageConfig.scripts["build:workspace-deps"]).toBe(
      "pnpm --filter @daygym/contracts build && pnpm --filter @daygym/training-runtime build",
    );
    expect(packageConfig.scripts.build).toMatch(
      /^pnpm build:workspace-deps && /,
    );
  });
});
