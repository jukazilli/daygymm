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
import { trainingSessionHref } from "../../lib/training-weekdays";
import { AppIcon, type AppIconName } from "./app-icon";
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

function QuickAccess({
  description,
  href,
  icon,
  title,
}: Readonly<{
  description: string;
  href: string;
  icon: AppIconName;
  title: string;
}>) {
  return (
    <Link className="training-quick-action" href={href}>
      <span className="training-quick-action-icon">
        <AppIcon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <AppIcon name="forward" size={20} />
    </Link>
  );
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

  if (trainingState.plan) {
    const activeRun = trainingState.activeRun;
    const completedCount = activeRun
      ? activeRun.session.items.filter((item) => item.completedAt).length
      : 0;
    return (
      <div className="training-plan-layout training-hub-layout">
        {trainingState.nextSession ? (
          <section className="next-training-card training-hub-primary">
            <div>
              <p className="eyebrow">
                {activeRun ? "Em andamento" : "Treino de hoje"}
              </p>
              <h1>{trainingState.nextSession.name}</h1>
              <p>
                {activeRun
                  ? `${completedCount} de ${activeRun.session.items.length} exercícios`
                  : `${trainingState.nextSession.items.length} exercícios`}
              </p>
            </div>
            <Link
              className="button-primary"
              href={trainingSessionHref(trainingState.nextSession.sessionId)}
            >
              <AppIcon name={activeRun ? "play" : "workouts"} size={20} />
              <span>{activeRun ? "Continuar treino" : "Abrir treino"}</span>
            </Link>
          </section>
        ) : (
          <section className="next-training-card training-rest-card training-hub-primary">
            <div>
              <p className="eyebrow">Hoje</p>
              <h1>Dia de descanso.</h1>
              <p>Se quiser treinar, escolha uma sessão do seu plano.</p>
            </div>
            <Link className="button-primary" href="/treinos/meus/">
              Escolher treino
            </Link>
          </section>
        )}

        <section aria-labelledby="training-quick-access-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {trainingState.plan.name} · versão {trainingState.plan.version}
              </p>
              <h2 id="training-quick-access-title">Acessos rápidos</h2>
            </div>
          </div>
          <div className="training-quick-actions">
            <QuickAccess
              description="Crie ou edite o plano atual"
              href="/treinos/plano/"
              icon="plan"
              title="Criar treino"
            />
            <QuickAccess
              description="Veja a agenda e escolha uma sessão"
              href="/treinos/meus/"
              icon="calendar"
              title="Meus treinos"
            />
            <QuickAccess
              description="Defina carga inicial e passo"
              href="/treinos/cargas/"
              icon="settings"
              title="Configurar cargas"
            />
          </div>
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

  if (sourceState.source === "manual") {
    return (
      <section className="app-state-card training-card">
        <p className="eyebrow">Montagem manual</p>
        <h1>Monte seu primeiro plano.</h1>
        <Link className="button-primary" href="/treinos/plano/">
          Montar plano
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
