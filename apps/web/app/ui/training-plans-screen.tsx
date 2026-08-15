"use client";

import { useEffect, useRef, useState } from "react";

import type {
  TrainingPlanEditorGateway,
  TrainingPlanSummary,
} from "@daygym/contracts";

import { createWebTrainingPlanEditorGateway } from "../../lib/training-plan-editor-gateway";
import { AppIcon } from "./app-icon";
import {
  AppLoadingSkeleton,
  AppShell,
  FixedActionBar,
  FocusedBackAction,
} from "./app-shell";

interface TrainingPlansScreenProps {
  readonly gateway?: TrainingPlanEditorGateway;
  readonly navigate?: (path: string) => void;
}

type PendingAction =
  | { readonly kind: "new" }
  | { readonly kind: "restore"; readonly plan: TrainingPlanSummary };

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function PlanChangeDialog({
  busy,
  onClose,
  onConfirm,
  pending,
}: Readonly<{
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: PendingAction;
}>) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoring = pending.kind === "restore";

  useEffect(() => {
    confirmRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="plan-change-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <h2 id="plan-change-title">
          {restoring ? "Ativar este plano?" : "Criar um novo plano?"}
        </h2>
        <p>
          {restoring
            ? "O plano atual será arquivado. Seu histórico continuará salvo."
            : "Ao salvar o novo plano, ele se torna ativo e o plano atual fica arquivado. Seu histórico continua salvo."}
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {busy
              ? "Ativando…"
              : restoring
                ? "Ativar e editar"
                : "Começar novo plano"}
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Manter plano atual
          </button>
        </div>
      </section>
    </div>
  );
}

export function TrainingPlansScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: TrainingPlansScreenProps) {
  const gatewayRef = useRef<TrainingPlanEditorGateway | undefined>(
    providedGateway,
  );
  const [plans, setPlans] = useState<readonly TrainingPlanSummary[]>();
  const [pending, setPending] = useState<PendingAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function gateway() {
    gatewayRef.current ??= createWebTrainingPlanEditorGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void gateway()
      .list()
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result.ok) {
          if (result.reason === "session") {
            navigate("/entrar/");
            return;
          }
          setError("Não foi possível carregar seus planos.");
          return;
        }
        setPlans(result.value);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const activePlan = plans?.find((plan) => plan.archivedAt === null);

  function openPlan(plan: TrainingPlanSummary) {
    setError("");
    if (plan.archivedAt === null) {
      navigate(`/treinos/plano/?plano=${plan.planId}`);
      return;
    }
    setPending({ kind: "restore", plan });
  }

  function startNewPlan() {
    setError("");
    if (activePlan) {
      setPending({ kind: "new" });
      return;
    }
    navigate("/treinos/plano/?novo=1");
  }

  async function confirmPending() {
    if (!pending || busy) {
      return;
    }
    if (pending.kind === "new") {
      navigate("/treinos/plano/?novo=1");
      return;
    }
    setBusy(true);
    const result = await gateway().restore(pending.plan.planId);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setPending(undefined);
      setError(
        "Finalize ou pause o treino em andamento antes de trocar o plano ativo.",
      );
      return;
    }
    navigate(`/treinos/plano/?plano=${pending.plan.planId}`);
  }

  return (
    <AppShell active="workouts" hasFixedAction variant="focused">
      <FocusedBackAction href="/treinos/" />
      <div className="training-plans-page">
        <header className="plan-editor-header">
          <div className="plan-editor-title">
            <p className="eyebrow">Criação e edição</p>
            <h1>Planos de treino</h1>
          </div>
          <p className="page-guidance">
            Escolha um plano para editar ou comece um novo.
          </p>
        </header>

        {!plans && !error ? (
          <AppLoadingSkeleton label="Carregando planos" />
        ) : null}

        {plans?.length === 0 ? (
          <section className="plan-editor-empty">
            <h2>Você ainda não criou um plano.</h2>
            <p>Comece com um treino e ajuste os detalhes no seu ritmo.</p>
          </section>
        ) : null}

        {plans && plans.length > 0 ? (
          <ul className="training-plan-catalog" aria-label="Seus planos">
            {plans.map((plan) => {
              const isActive = plan.archivedAt === null;
              return (
                <li key={plan.planId}>
                  <button
                    aria-label={`${isActive ? "Editar" : "Ativar"} ${plan.name}, versão ${plan.currentVersion}`}
                    className="training-plan-catalog-row"
                    onClick={() => openPlan(plan)}
                    type="button"
                  >
                    <span className="training-plan-catalog-copy">
                      <strong>{plan.name}</strong>
                      <small>
                        Versão {plan.currentVersion} · {plan.sessionCount}{" "}
                        {plan.sessionCount === 1 ? "treino" : "treinos"} ·{" "}
                        {plan.itemCount}{" "}
                        {plan.itemCount === 1 ? "exercício" : "exercícios"}
                      </small>
                    </span>
                    <span
                      className="training-plan-status"
                      data-active={isActive || undefined}
                    >
                      {isActive ? "Ativo" : "Arquivado"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {error ? (
          <p className="status-message status-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <FixedActionBar>
        <button
          className="button-primary"
          disabled={!plans || busy}
          onClick={startNewPlan}
          type="button"
        >
          <AppIcon name="plus" size={20} />
          <span>Novo plano</span>
        </button>
      </FixedActionBar>

      {pending ? (
        <PlanChangeDialog
          busy={busy}
          onClose={() => setPending(undefined)}
          onConfirm={() => void confirmPending()}
          pending={pending}
        />
      ) : null}
    </AppShell>
  );
}
