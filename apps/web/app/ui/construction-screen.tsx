"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { AuthGateway } from "../../lib/auth-gateway";
import { createWebAuthGateway } from "../../lib/auth-gateway";
import { AppShell, type AppDestination } from "./app-shell";

interface ConstructionScreenProps {
  readonly active: AppDestination;
  readonly eyebrow?: string;
  readonly gateway?: AuthGateway;
  readonly navigate?: (path: string) => void;
  readonly title: string;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export function ConstructionScreen({
  active,
  eyebrow = "Em construção",
  gateway: providedGateway,
  navigate = defaultNavigate,
  title,
}: ConstructionScreenProps) {
  const gatewayRef = useRef<AuthGateway | undefined>(providedGateway);
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");

  function gateway() {
    gatewayRef.current ??= createWebAuthGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    let activeRequest = true;
    void gateway()
      .hasActiveEligibleSession()
      .then((result) => {
        if (!activeRequest) {
          return;
        }
        if (result.ok && result.value) {
          setSessionState("ready");
          return;
        }
        if (result.ok) {
          navigate("/entrar/");
          return;
        }
        setSessionState("unavailable");
      });
    return () => {
      activeRequest = false;
    };
  }, [navigate]);

  return (
    <AppShell active={active}>
      {sessionState === "checking" ? (
        <div className="app-loading" role="status">
          Verificando acesso…
        </div>
      ) : null}
      {sessionState === "ready" ? (
        <section className="app-state-card construction-card">
          <span className="construction-mark" aria-hidden="true">
            D
          </span>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <Link className="button-primary" href="/hoje/">
            Voltar para Hoje
          </Link>
        </section>
      ) : null}
      {sessionState === "unavailable" ? (
        <section className="app-state-card" role="alert">
          <p className="eyebrow">Acesso</p>
          <h1>Não foi possível verificar sua conta.</h1>
          <button
            className="button-secondary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Tentar novamente
          </button>
        </section>
      ) : null}
    </AppShell>
  );
}
