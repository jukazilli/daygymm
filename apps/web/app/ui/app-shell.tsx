import Link from "next/link";
import type { ReactNode } from "react";

import { AppIcon, type AppIconName } from "./app-icon";

export type AppDestination =
  "feed" | "profile" | "progress" | "today" | "workouts";

interface AppShellProps {
  readonly active: AppDestination;
  readonly children: ReactNode;
}

interface NavigationItem {
  readonly destination: AppDestination;
  readonly href: string;
  readonly icon: AppIconName;
  readonly label: string;
}

const navigationItems: readonly NavigationItem[] = [
  { destination: "today", href: "/hoje/", icon: "home", label: "Hoje" },
  {
    destination: "workouts",
    href: "/treinos/",
    icon: "workouts",
    label: "Treinos",
  },
  { destination: "feed", href: "/feed/", icon: "feed", label: "Feed" },
  {
    destination: "progress",
    href: "/progresso/",
    icon: "progress",
    label: "Progresso",
  },
  {
    destination: "profile",
    href: "/conta/",
    icon: "profile",
    label: "Perfil",
  },
];

export function AppLoadingSkeleton({
  label = "Carregando conteúdo",
}: Readonly<{ label?: string }>) {
  return (
    <div className="app-skeleton" role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <span className="skeleton-line skeleton-line-short" />
      <span className="skeleton-line skeleton-line-title" />
      <span className="skeleton-line skeleton-line-title skeleton-line-medium" />
      <span className="skeleton-line skeleton-line-body" />
      <span className="skeleton-button" />
    </div>
  );
}

export function AppShell({ active, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/hoje/" aria-label="DayGym — Hoje">
          DayGym
        </Link>
        <span className="preview-badge">Prévia</span>
      </header>

      <main className="app-content">{children}</main>

      <nav className="app-navigation" aria-label="Navegação principal">
        {navigationItems.map((item) => {
          const selected = active === item.destination;
          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className="app-navigation-item"
              data-selected={selected || undefined}
              href={item.href}
              key={item.href}
            >
              <AppIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
