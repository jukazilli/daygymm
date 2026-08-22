import Link from "next/link";
import type { ReactNode } from "react";

import { AppIcon, type AppIconName } from "./app-icon";
import { ConnectivityStatus } from "./connectivity-status";

export type AppDestination =
  "feed" | "profile" | "progress" | "today" | "workouts";

interface AppShellProps {
  readonly active: AppDestination;
  readonly children: ReactNode;
  readonly hasFixedAction?: boolean;
  readonly variant?: "focused" | "standard";
}

interface NavigationItem {
  readonly destination: AppDestination;
  readonly href: string;
  readonly icon: AppIconName;
  readonly label: string;
}

type FocusedBackActionProps =
  | { readonly href: string; readonly onClick?: never }
  | { readonly href?: never; readonly onClick: () => void };

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

export function FocusedBackAction({ href, onClick }: FocusedBackActionProps) {
  const content = (
    <>
      <AppIcon name="back" size={30} />
      <span className="sr-only">Voltar</span>
    </>
  );

  const action = href ? (
    <Link aria-label="Voltar" className="focused-back-action" href={href}>
      {content}
    </Link>
  ) : (
    <button
      aria-label="Voltar"
      className="focused-back-action"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );

  return (
    <div className="focused-header">
      <div className="focused-header-inner">{action}</div>
    </div>
  );
}

export function FixedActionBar({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="fixed-action-bar">{children}</div>;
}

export function AppShell({
  active,
  children,
  hasFixedAction = false,
  variant = "standard",
}: AppShellProps) {
  const focused = variant === "focused";
  return (
    <div
      className={`app-shell${focused ? " app-shell-focused" : ""}${focused && hasFixedAction ? " app-shell-focused-action" : ""}`}
    >
      {!focused ? (
        <header className="app-header">
          <Link className="brand" href="/hoje/" aria-label="DayGym — Hoje">
            DayGym
          </Link>
          <ConnectivityStatus />
        </header>
      ) : null}

      <main className="app-content">{children}</main>

      {!focused ? (
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
      ) : null}
    </div>
  );
}
