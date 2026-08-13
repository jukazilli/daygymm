"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import { AppShell } from "./app-shell";

interface TodayScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
}

const sourceLabels: Record<PlanSource, string> = {
  daygym_suggestion: "Sugestão DayGym",
  manual: "Montagem manual",
  official_xlsx: "Planilha oficial",
  professional: "Plano de profissional",
};

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function TodayHero({ state }: Readonly<{ state: PlanSourceState }>) {
  if (!state.onboardingCompleted) {
    return (
      <section className="today-hero">
        <p className="eyebrow">Seu próximo passo</p>
        <h1>Prepare seu primeiro treino.</h1>
        <p>Responda seis perguntas rápidas para começar.</p>
        <Link className="button-primary" href="/comecar/">
          Continuar configuração
        </Link>
      </section>
    );
  }

  if (!state.source) {
    return (
      <section className="today-hero">
        <p className="eyebrow">Seu próximo passo</p>
        <h1>Escolha como começar.</h1>
        <p>Use uma sugestão, importe ou monte seu plano.</p>
        <Link className="button-primary" href="/escolher-plano/">
          Escolher caminho
        </Link>
      </section>
    );
  }

  return (
    <section className="today-hero">
      <p className="eyebrow">Seu plano</p>
      <h1>Seu treino começa aqui.</h1>
      <p>{sourceLabels[state.source]}</p>
      <Link className="button-primary" href="/treinos/">
        Abrir Treinos
      </Link>
    </section>
  );
}

export function TodayScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: TodayScreenProps) {
  const gatewayRef = useRef<PlanSourceGateway | undefined>(providedGateway);
  const [state, setState] = useState<PlanSourceState>();
  const [failed, setFailed] = useState(false);

  function gateway() {
    gatewayRef.current ??= createWebPlanSourceGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void gateway()
      .load()
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result.ok) {
          if (result.reason === "session") {
            navigate("/entrar/");
            return;
          }
          setFailed(true);
          return;
        }
        setState(result.value);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AppShell active="today">
      <div className="today-layout">
        {state ? <TodayHero state={state} /> : null}
        {!state && !failed ? (
          <div className="app-loading" role="status">
            Carregando seu dia…
          </div>
        ) : null}
        {failed ? (
          <section className="app-state-card" role="alert">
            <p className="eyebrow">Hoje</p>
            <h1>Não foi possível carregar.</h1>
            <button
              className="button-secondary"
              onClick={() => window.location.reload()}
              type="button"
            >
              Tentar novamente
            </button>
          </section>
        ) : null}

        <section className="home-modules" aria-labelledby="home-modules-title">
          <div className="section-heading">
            <h2 id="home-modules-title">Nutrição e GdShop</h2>
          </div>
          <div className="home-module-grid">
            <Link className="home-module-card" href="/nutricao/">
              <span className="module-icon" aria-hidden="true">
                N
              </span>
              <span>
                <strong>Nutrição</strong>
                <small>Em construção</small>
              </span>
              <span className="module-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="home-module-card" href="/gdshop/">
              <span className="module-icon" aria-hidden="true">
                G
              </span>
              <span>
                <strong>GdShop</strong>
                <small>18+ · Em construção</small>
              </span>
              <span className="module-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
