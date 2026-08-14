"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
  PracticalTrainingState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import { createWebTrainingSessionGateway } from "../../lib/training-session-gateway";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface TodayScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
  readonly trainingGateway?: TrainingSessionGateway;
}

const sourceLabels: Record<PlanSource, string> = {
  manual: "Montagem manual",
  official_xlsx: "Planilha oficial",
  professional: "Acompanhamento profissional",
};

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function completedToday(completedAt: string | null) {
  return completedAt
    ? new Date(completedAt).toDateString() === new Date().toDateString()
    : false;
}

function TodayHero({
  sourceState,
  trainingState,
}: Readonly<{
  sourceState: PlanSourceState;
  trainingState: PracticalTrainingState;
}>) {
  if (!sourceState.onboardingCompleted) {
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

  if (!sourceState.source) {
    return (
      <section className="today-hero">
        <p className="eyebrow">Seu próximo passo</p>
        <h1>Escolha como começar.</h1>
        <p>Importe, crie ou receba seu plano.</p>
        <Link className="button-primary" href="/escolher-plano/">
          Escolher caminho
        </Link>
      </section>
    );
  }

  if (trainingState.activeRun) {
    const completed = trainingState.activeRun.session.items.filter(
      (item) => item.completedAt,
    ).length;
    return (
      <section className="today-hero today-training-hero">
        <p className="eyebrow">Treino em andamento</p>
        <h1>{trainingState.activeRun.session.name}</h1>
        <p>
          {completed} de {trainingState.activeRun.session.items.length}{" "}
          exercícios
        </p>
        <Link className="button-primary" href="/treinos/sessao/">
          Continuar treino
        </Link>
      </section>
    );
  }

  if (trainingState.plan && completedToday(trainingState.lastCompletedAt)) {
    return (
      <section className="today-hero today-training-hero">
        <p className="eyebrow">Treino concluído</p>
        <h1>Feito por hoje.</h1>
        <p>{trainingState.plan.name}</p>
        <Link className="button-secondary" href="/treinos/">
          Ver próximos treinos
        </Link>
      </section>
    );
  }

  if (trainingState.plan && trainingState.nextSession) {
    return (
      <section className="today-hero today-training-hero">
        <p className="eyebrow">Treino de hoje</p>
        <h1>{trainingState.nextSession.name}</h1>
        <p>
          {trainingState.nextSession.items.length} exercícios ·{" "}
          {trainingState.plan.name}
        </p>
        <Link className="button-primary" href="/treinos/sessao/">
          Abrir treino
        </Link>
      </section>
    );
  }

  return (
    <section className="today-hero">
      <p className="eyebrow">{sourceLabels[sourceState.source]}</p>
      <h1>Conclua seu primeiro plano.</h1>
      <Link className="button-primary" href="/treinos/">
        Abrir Treinos
      </Link>
    </section>
  );
}

export function TodayScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
  trainingGateway: providedTrainingGateway,
}: TodayScreenProps) {
  const gatewayRef = useRef<PlanSourceGateway | undefined>(providedGateway);
  const trainingGatewayRef = useRef<TrainingSessionGateway | undefined>(
    providedTrainingGateway,
  );
  const [sourceState, setSourceState] = useState<PlanSourceState>();
  const [trainingState, setTrainingState] = useState<PracticalTrainingState>();
  const [failed, setFailed] = useState(false);

  function gateway() {
    gatewayRef.current ??= createWebPlanSourceGateway();
    return gatewayRef.current;
  }

  function trainingGateway() {
    trainingGatewayRef.current ??= createWebTrainingSessionGateway();
    return trainingGatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void Promise.all([gateway().load(), trainingGateway().load()]).then(
      ([sourceResult, trainingResult]) => {
        if (!active) {
          return;
        }
        if (!sourceResult.ok || !trainingResult.ok) {
          if (
            (!sourceResult.ok && sourceResult.reason === "session") ||
            (!trainingResult.ok && trainingResult.reason === "session")
          ) {
            navigate("/entrar/");
            return;
          }
          setFailed(true);
          return;
        }
        setSourceState(sourceResult.value);
        setTrainingState(trainingResult.value);
      },
    );
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AppShell active="today">
      <div className="today-layout">
        {sourceState && trainingState ? (
          <TodayHero sourceState={sourceState} trainingState={trainingState} />
        ) : null}
        {(!sourceState || !trainingState) && !failed ? (
          <AppLoadingSkeleton label="Carregando seu dia" />
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
            <h2 id="home-modules-title">Acessos rápidos</h2>
          </div>
          <div className="home-module-grid">
            <Link className="home-module-card" href="/nutricao/">
              <span className="module-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M7 3v7m3-7v7M5 7h7m-3 3v11m8-18v18m0-18c-2 2-3 5-3 8h3" />
                </svg>
              </span>
              <span>
                <strong>Nutrição</strong>
                <small>Refeições e metas</small>
              </span>
              <span className="module-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="home-module-card" href="/gdshop/">
              <span className="module-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 8h14l-1 12H6ZM9 9V6a3 3 0 0 1 6 0v3" />
                </svg>
              </span>
              <span>
                <strong>GdShop</strong>
                <small>Produtos para sua rotina</small>
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
