import type { ConfigContext, ExpoConfig } from "expo/config";

import appVariants from "./config/app-variants.json";

export type AppVariant = keyof typeof appVariants;

const defaultVariant: AppVariant = "development";

export function resolveAppVariant(value?: string): AppVariant {
  if (!value) {
    return defaultVariant;
  }

  if (value in appVariants) {
    return value as AppVariant;
  }

  throw new Error(
    `Invalid APP_VARIANT "${value}". Expected development, preview or production.`,
  );
}

export function getAppVariant(value?: string) {
  const variant = resolveAppVariant(value);

  return {
    variant,
    ...appVariants[variant],
    authCallback: `${appVariants[variant].scheme}://auth/callback`,
  } as const;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const app = getAppVariant(process.env.APP_VARIANT);

  return {
    ...config,
    name: app.name,
    slug: "daygym",
    version: "0.1.0",
    icon: "./assets/icon.png",
    orientation: "portrait",
    userInterfaceStyle: "light",
    scheme: app.scheme,
    runtimeVersion: {
      policy: "fingerprint",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: app.identifier,
      icon: "./assets/icon.png",
    },
    android: {
      allowBackup: false,
      package: app.identifier,
      adaptiveIcon: {
        backgroundColor: "#FF6B00",
        foregroundImage: "./assets/adaptive-icon.png",
      },
    },
    plugins: [
      "expo-router",
      [
        "expo-dev-client",
        {
          addGeneratedScheme: app.variant === "development",
        },
      ],
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
        },
      ],
      [
        "expo-sqlite",
        {
          useSQLCipher: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#FF6B00",
          dark: {
            backgroundColor: "#17110E",
            image: "./assets/splash-icon.png",
          },
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      appVariant: app.variant,
      authCallback: app.authCallback,
    },
  };
};
