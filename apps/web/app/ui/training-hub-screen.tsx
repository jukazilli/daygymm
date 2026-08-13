"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ImportedTrainingPlan,
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
  TrainingPlanGateway,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import { createWebTrainingPlanGateway } from "../../lib/training-plan-gateway";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface TrainingHubScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
  readonly trainingPlanGateway?: TrainingPlanGateway;
}

const sourceContent: Record<PlanSource, { label: string; next: string }> = {
  daygym_suggestion: {
    label: "Sugestão DayGym",
    next: "Escolher um plano sugerido",
  },
  manual: { label: "Montagem manual", next: "Montar seu primeiro plano" },
  official_xlsx: {
    label: "Planilha oficial",
    next: "Importar sua planilha",
  },
  professional: {
    label: "Plano de profissional",
    next: "Receber um convite",
  },
};

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function TrainingState({
  activePlan,
  state,
}: Readonly<{
  activePlan: ImportedTrainingPlan | null;
  state: PlanSourceState;
}>) {
  if (!state.onboardingCompleted) {
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

  if (!state.source) {
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

  if (activePlan) {
    return (
      <section className="app-state-card training-card">
        <p className="eyebrow">Plano ativo · versão {activePlan.version}</p>
        <h1>{activePlan.name}</h1>
        <p>
          {activePlan.sessionCount} sessões · {activePlan.itemCount} exercícios
        </p>
        <span className="construction-pill">Execução em construção</span>
      </section>
    );
  }

  if (state.source === "official_xlsx") {
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

  const content = sourceContent[state.source];
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
  trainingPlanGateway: providedTrainingPlanGateway,
}: TrainingHubScreenProps) {
  const gatewayRef = useRef<PlanSourceGateway | undefined>(providedGateway);
  const trainingPlanGatewayRef = useRef<TrainingPlanGateway | undefined>(
    providedTrainingPlanGateway,
  );
  const [state, setState] = useState<PlanSourceState>();
  const [activePlan, setActivePlan] = useState<ImportedTrainingPlan | null>();
  const [failed, setFailed] = useState(false);

  function gateway() {
    gatewayRef.current ??= createWebPlanSourceGateway();
    return gatewayRef.current;
  }

  function trainingPlanGateway() {
    trainingPlanGatewayRef.current ??= createWebTrainingPlanGateway();
    return trainingPlanGatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      gateway().load(),
      trainingPlanGateway().loadActive(),
    ]).then(([sourceResult, planResult]) => {
      if (!active) {
        return;
      }
      if (!sourceResult.ok || !planResult.ok) {
        if (
          (!sourceResult.ok && sourceResult.reason === "session") ||
          (!planResult.ok && planResult.reason === "session")
        ) {
          navigate("/entrar/");
          return;
        }
        setFailed(true);
        return;
      }
      setState(sourceResult.value);
      setActivePlan(planResult.value);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AppShell active="workouts">
      {(!state || activePlan === undefined) && !failed ? (
        <AppLoadingSkeleton label="Carregando Treinos" />
      ) : null}
      {state && activePlan !== undefined ? (
        <TrainingState activePlan={activePlan} state={state} />
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
