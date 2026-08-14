"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
  PracticalTrainingState,
  TrainingPlanGateway,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import { createWebTrainingPlanGateway } from "../../lib/training-plan-gateway";
import { createWebTrainingSessionGateway } from "../../lib/training-session-gateway";
import {
  currentTrainingWeekday,
  trainingSessionHref,
  trainingWeekdayName,
} from "../../lib/training-weekdays";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface TrainingHubScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
  readonly trainingPlanGateway?: TrainingPlanGateway;
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
  onRename,
  sourceState,
  trainingState,
}: Readonly<{
  onRename: (planId: string, name: string) => Promise<boolean>;
  sourceState: PlanSourceState;
  trainingState: PracticalTrainingState;
}>) {
  const [editingName, setEditingName] = useState(false);
  const [planName, setPlanName] = useState(trainingState.plan?.name ?? "");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);
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
          {editingName ? (
            <form
              className="plan-name-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (renameBusy) {
                  return;
                }
                setRenameBusy(true);
                setRenameFailed(false);
                void onRename(trainingState.plan!.planId, planName).then(
                  (saved) => {
                    setRenameBusy(false);
                    setRenameFailed(!saved);
                    if (saved) {
                      setEditingName(false);
                    }
                  },
                );
              }}
            >
              <label>
                <span>Nome do treino</span>
                <input
                  maxLength={80}
                  onChange={(event) => setPlanName(event.target.value)}
                  value={planName}
                />
              </label>
              <div>
                <button
                  className="button-primary"
                  disabled={renameBusy || !planName.trim()}
                  type="submit"
                >
                  {renameBusy ? "Salvando…" : "Salvar nome"}
                </button>
                <button
                  className="button-text"
                  onClick={() => {
                    setPlanName(trainingState.plan!.name);
                    setEditingName(false);
                    setRenameFailed(false);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
              {renameFailed ? (
                <p className="status-message status-error" role="alert">
                  Não foi possível salvar o nome.
                </p>
              ) : null}
            </form>
          ) : (
            <button
              className="button-text plan-name-edit"
              onClick={() => setEditingName(true)}
              type="button"
            >
              Editar nome
            </button>
          )}
        </section>

        {trainingState.nextSession ? (
          <section className="next-training-card">
            <div>
              <p className="eyebrow">
                {activeRun ? "Em andamento" : "Treino de hoje"}
              </p>
              <h2>{trainingState.nextSession.name}</h2>
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
              {activeRun ? "Continuar treino" : "Abrir treino"}
            </Link>
          </section>
        ) : (
          <section className="next-training-card training-rest-card">
            <div>
              <p className="eyebrow">Hoje</p>
              <h2>Dia de descanso.</h2>
            </div>
          </section>
        )}

        <section
          className="weekly-training-schedule"
          aria-labelledby="weekly-training-title"
        >
          <div className="section-heading">
            <h2 id="weekly-training-title">Agenda semanal</h2>
          </div>
          <ol>
            {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
              const scheduledSessions = trainingState.sessions.filter(
                (session) => session.weekday === weekday,
              );
              return (
                <li
                  data-today={
                    weekday === currentTrainingWeekday() ? "true" : undefined
                  }
                  key={weekday}
                >
                  <div className="schedule-day">
                    <strong>{trainingWeekdayName(weekday)}</strong>
                    {weekday === currentTrainingWeekday() ? (
                      <small>Hoje</small>
                    ) : null}
                  </div>
                  <div className="schedule-sessions">
                    {scheduledSessions.length > 0 ? (
                      scheduledSessions.map((session) => (
                        <div key={session.sessionId}>
                          <span>
                            <strong>{session.name}</strong>
                            <small>{session.items.length} exercícios</small>
                          </span>
                          <Link href={trainingSessionHref(session.sessionId)}>
                            Abrir
                          </Link>
                        </div>
                      ))
                    ) : (
                      <small>Descanso</small>
                    )}
                  </div>
                </li>
              );
            })}
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
  trainingPlanGateway: providedTrainingPlanGateway,
  trainingGateway: providedTrainingGateway,
}: TrainingHubScreenProps) {
  const gatewayRef = useRef<PlanSourceGateway | undefined>(providedGateway);
  const trainingGatewayRef = useRef<TrainingSessionGateway | undefined>(
    providedTrainingGateway,
  );
  const trainingPlanGatewayRef = useRef<TrainingPlanGateway | undefined>(
    providedTrainingPlanGateway,
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

  function trainingPlanGateway() {
    trainingPlanGatewayRef.current ??= createWebTrainingPlanGateway();
    return trainingPlanGatewayRef.current;
  }

  async function renamePlan(planId: string, name: string) {
    const result = await trainingPlanGateway().rename(planId, name);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
      }
      return false;
    }
    setTrainingState((current) =>
      current?.plan
        ? { ...current, plan: { ...current.plan, name: result.value.name } }
        : current,
    );
    return true;
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
          onRename={renamePlan}
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
