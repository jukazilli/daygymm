import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";

import { dayGymTokens } from "@daygym/design-tokens";

import "@fontsource/nunito/400.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "./globals.css";

import { PwaRegistration } from "./pwa-registration";
import { PwaSplash } from "./pwa-splash";

export const metadata: Metadata = {
  applicationName: "DayGym",
  title: "DayGym",
  description: "Plano, registro e evolução do seu treino.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DayGym",
  },
  icons: {
    apple: [
      {
        url: "/pwa/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6B00",
};

type CssVariables = CSSProperties & Record<`--${string}`, string>;

const themeVariables: CssVariables = {
  "--color-action": dayGymTokens.color.light.action,
  "--color-action-contrast": dayGymTokens.color.light.actionContrast,
  "--color-action-pressed": dayGymTokens.color.light.actionPressed,
  "--color-action-soft": dayGymTokens.color.light.actionSoft,
  "--color-border": dayGymTokens.color.light.border,
  "--color-canvas": dayGymTokens.color.light.canvas,
  "--color-card": dayGymTokens.color.light.card,
  "--color-danger": dayGymTokens.color.light.danger,
  "--color-success": dayGymTokens.color.light.success,
  "--color-text": dayGymTokens.color.light.textPrimary,
  "--color-text-secondary": dayGymTokens.color.light.textSecondary,
  "--radius-card": `${dayGymTokens.radius.card}px`,
  "--radius-control": `${dayGymTokens.radius.control}px`,
  "--space-1": `${dayGymTokens.space[1]}px`,
  "--space-2": `${dayGymTokens.space[2]}px`,
  "--space-3": `${dayGymTokens.space[3]}px`,
  "--space-4": `${dayGymTokens.space[4]}px`,
  "--space-5": `${dayGymTokens.space[5]}px`,
  "--space-6": `${dayGymTokens.space[6]}px`,
  "--space-8": `${dayGymTokens.space[8]}px`,
  "--space-10": `${dayGymTokens.space[10]}px`,
  "--space-12": `${dayGymTokens.space[12]}px`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body style={themeVariables}>
        <PwaSplash />
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
