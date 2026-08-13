import Link from "next/link";
import type { ReactNode } from "react";

export type AppDestination =
  "feed" | "profile" | "progress" | "today" | "workouts";

interface AppShellProps {
  readonly active: AppDestination;
  readonly children: ReactNode;
}

interface NavigationItem {
  readonly href: string;
  readonly icon: AppDestination;
  readonly label: string;
}

const navigationItems: readonly NavigationItem[] = [
  { href: "/hoje/", icon: "today", label: "Hoje" },
  { href: "/treinos/", icon: "workouts", label: "Treinos" },
  { href: "/feed/", icon: "feed", label: "Feed" },
  { href: "/progresso/", icon: "progress", label: "Progresso" },
  { href: "/conta/", icon: "profile", label: "Perfil" },
];

function NavigationIcon({ name }: Readonly<{ name: AppDestination }>) {
  if (name === "today") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
      </svg>
    );
  }

  if (name === "workouts") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 9v6m3-8v10m12-10v10m3-8v6M6 12h12" />
      </svg>
    );
  }

  if (name === "feed") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z" />
      </svg>
    );
  }

  if (name === "progress") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.5-3.7 2.8-5.5 7-5.5s6.5 1.8 7 5.5" />
    </svg>
  );
}

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
          const selected = active === item.icon;
          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className="app-navigation-item"
              data-selected={selected || undefined}
              href={item.href}
              key={item.href}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
