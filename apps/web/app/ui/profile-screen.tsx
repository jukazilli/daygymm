"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { AuthGateway } from "../../lib/auth-gateway";
import { createWebAuthGateway } from "../../lib/auth-gateway";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface ProfileScreenProps {
  readonly gateway?: AuthGateway;
  readonly navigate?: (path: string) => void;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export function ProfileScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: ProfileScreenProps) {
  const gatewayRef = useRef<AuthGateway | undefined>(providedGateway);
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [isSigningOut, setIsSigningOut] = useState(false);

  function gateway() {
    gatewayRef.current ??= createWebAuthGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void gateway()
      .hasActiveEligibleSession()
      .then((result) => {
        if (!active) {
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
      active = false;
    };
  }, [navigate]);

  async function signOut() {
    setIsSigningOut(true);
    const result = await gateway().signOut();
    setIsSigningOut(false);
    if (result.ok) {
      navigate("/entrar/");
      return;
    }
    setSessionState("unavailable");
  }

  return (
    <AppShell active="profile">
      {sessionState === "checking" ? (
        <AppLoadingSkeleton label="Verificando acesso" />
      ) : null}
      {sessionState === "ready" ? (
        <div className="profile-layout">
          <section className="app-state-card profile-card">
            <p className="eyebrow">Perfil</p>
            <h1>Sua conta</h1>
            <p>Sessão ativa neste aparelho.</p>
            <button
              className="button-secondary"
              disabled={isSigningOut}
              onClick={() => void signOut()}
              type="button"
            >
              {isSigningOut ? "Saindo…" : "Sair deste aparelho"}
            </button>
          </section>
          <nav className="profile-links" aria-label="Documentos da conta">
            <Link href="/privacidade/">Privacidade</Link>
            <Link href="/termos/">Termos de teste</Link>
          </nav>
        </div>
      ) : null}
      {sessionState === "unavailable" ? (
        <section className="app-state-card" role="alert">
          <p className="eyebrow">Perfil</p>
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
