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

interface TrainingHubScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
  readonly trainingGateway?: TrainingSessionGateway;
}

const sourceContent: Record<PlanSource, { label: string; next: string }> = {
  manual: { label: "Montagem manual", next: "Montar seu primeiro plano" },
  official_xlsx: {
    label: "Planilha oficial",
    next: "Importar sua planilha",
  },
  professional: {
    label: "Acompanhamento profissional",
    next: "Conectar um profissional",
  },
};

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function TrainingState({
  sourceState,
  trainingState,
}: Readonly<{
  sourceState: PlanSourceState;
  trainingState: PracticalTrainingState;
}>) {
  if (!sourceState.onboardingCompleted) {
    return (
      <section className="app-state-card training-card">
        <p className="eyebrow">Treinos</p>
        <h1>Prepare seu contexto.</h1>
        <Link className="button-primary" href="/comecar/">
          Continuar configuração
        </Link>
      </section>
    );
  }

  if (!sourceState.source) {
    return (
      <section className="app-state-card training-card">
        <p className="eyebrow">Treinos</p>
        <h1>Escolha seu caminho.</h1>
        <Link className="button-primary" href="/escolher-plano/">
          Escolher caminho
        </Link>
      </section>
    );
  }

  if (trainingState.plan && trainingState.nextSession) {
    const activeRun = trainingState.activeRun;
    const completedCount = activeRun
      ? activeRun.session.items.filter((item) => item.completedAt).length
      : 0;
    return (
      <div className="training-plan-layout">
        <section className="app-state-card training-card">
          <p className="eyebrow">
            Plano ativo · versão {trainingState.plan.version}
          </p>
          <h1>{trainingState.plan.name}</h1>
          <p>
            {trainingState.plan.sessionCount} sessões ·{" "}
            {trainingState.plan.itemCount} exercícios
          </p>
        </section>

        <section className="next-training-card">
          <div>
            <p className="eyebrow">
              {activeRun ? "Em andamento" : "Próximo treino"}
            </p>
            <h2>{trainingState.nextSession.name}</h2>
            <p>
              {activeRun
                ? `${completedCount} de ${activeRun.session.items.length} exercícios`
                : `${trainingState.nextSession.items.length} exercícios`}
            </p>
          </div>
          <Link className="button-primary" href="/treinos/sessao/">
            {activeRun ? "Continuar treino" : "Abrir treino"}
          </Link>
        </section>

        <section
          className="plan-session-list"
          aria-labelledby="plan-session-title"
        >
          <div className="section-heading">
            <h2 id="plan-session-title">Plano</h2>
          </div>
          <ol>
            {trainingState.sessions.map((session) => (
              <li
                data-next={
                  session.sessionId === trainingState.nextSession?.sessionId
                    ? "true"
                    : undefined
                }
                key={session.sessionId}
              >
                <span>{session.dayOrder}</span>
                <div>
                  <strong>{session.name}</strong>
                  <small>{session.items.length} exercícios</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  if (sourceState.source === "official_xlsx") {
    return (
      <section className="app-state-card training-card">
        <p className="eyebrow">Planilha oficial</p>
        <h1>Importe seu primeiro plano.</h1>
        <Link className="button-primary" href="/treinos/importar/">
          Importar planilha
        </Link>
        <Link className="button-text" href="/escolher-plano/?alterar=1">
          Alterar caminho
        </Link>
      </section>
    );
  }

  const content = sourceContent[sourceState.source];
  return (
    <section className="app-state-card training-card">
      <p className="eyebrow">{content.label}</p>
      <h1>{content.next}</h1>
      <span className="construction-pill">Em construção</span>
      <Link className="button-secondary" href="/escolher-plano/?alterar=1">
        Alterar caminho
      </Link>
    </section>
  );
}

export function TrainingHubScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
  trainingGateway: providedTrainingGateway,
}: TrainingHubScreenProps) {
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
    <AppShell active="workouts">
      {(!sourceState || !trainingState) && !failed ? (
        <AppLoadingSkeleton label="Carregando Treinos" />
      ) : null}
      {sourceState && trainingState ? (
        <TrainingState
          sourceState={sourceState}
          trainingState={trainingState}
        />
      ) : null}
      {failed ? (
        <section className="app-state-card" role="alert">
          <p className="eyebrow">Treinos</p>
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
    </AppShell>
  );
}
