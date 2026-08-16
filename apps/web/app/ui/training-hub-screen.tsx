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
import { createLocalFirstTrainingSessionGateway } from "../../lib/local-first-training-session-gateway";
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
    return (
      <div className="training-plan-layout training-hub-layout">
        <section className="next-training-card training-hub-primary">
          <div className="training-hub-highlight-copy">
            <span className="training-hub-highlight-icon">
              <AppIcon name="calendar" size={28} />
            </span>
            <div>
              <p className="eyebrow">
                {trainingState.plan.name} · versão {trainingState.plan.version}
              </p>
              <h1>Meus treinos</h1>
              <p>
                {trainingState.plan.sessionCount}{" "}
                {trainingState.plan.sessionCount === 1 ? "treino" : "treinos"}
              </p>
            </div>
          </div>
          <Link className="button-primary" href="/treinos/meus/">
            <AppIcon name="calendar" size={20} />
            <span>Abrir meus treinos</span>
          </Link>
        </section>

        <section aria-labelledby="training-quick-access-title">
          <div className="section-heading">
            <div>
              <h2 id="training-quick-access-title">Ações do plano</h2>
            </div>
          </div>
          <div className="training-quick-actions">
            <QuickAccess
              description="Crie ou edite seus planos"
              href="/treinos/planos/"
              icon="plan"
              title="Criar treino"
            />
            <QuickAccess
              description="Defina carga inicial e passo"
              href="/treinos/cargas/"
              icon="settings"
              title="Configurar cargas"
            />
            <QuickAccess
              description="Reveja seus treinos concluídos"
              href="/treinos/historico/"
              icon="history"
              title="Histórico"
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
        <Link className="button-primary" href="/treinos/planos/">
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
    trainingGatewayRef.current ??= createLocalFirstTrainingSessionGateway();
    return trainingGatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void Promise.all([gateway().load(), trainingGateway().load()]).then(
      ([sourceResult, trainingResult]) => {
        if (!active) {
          return;
        }
        if (
          trainingResult.ok &&
          trainingResult.value.plan &&
          !sourceResult.ok
        ) {
          setSourceState({
            onboardingCompleted: true,
            selectedAt: null,
            source: "manual",
          });
          setTrainingState(trainingResult.value);
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
