import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

import { dayGymTokens } from "@daygym/design-tokens";

import "./globals.css";

export const metadata: Metadata = {
  title: "DayGym",
  description: "Painéis web do DayGym.",
};

type CssVariables = CSSProperties & Record<`--${string}`, string>;

const themeVariables: CssVariables = {
  "--color-action": dayGymTokens.color.light.action,
  "--color-action-soft": dayGymTokens.color.light.actionSoft,
  "--color-border": dayGymTokens.color.light.border,
  "--color-canvas": dayGymTokens.color.light.canvas,
  "--color-card": dayGymTokens.color.light.card,
  "--color-text": dayGymTokens.color.light.textPrimary,
  "--color-text-secondary": dayGymTokens.color.light.textSecondary,
  "--radius-card": `${dayGymTokens.radius.card}px`,
  "--radius-control": `${dayGymTokens.radius.control}px`,
  "--space-2": `${dayGymTokens.space[2]}px`,
  "--space-4": `${dayGymTokens.space[4]}px`,
  "--space-6": `${dayGymTokens.space[6]}px`,
  "--space-8": `${dayGymTokens.space[8]}px`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body style={themeVariables}>{children}</body>
    </html>
  );
}
