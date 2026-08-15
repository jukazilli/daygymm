"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import {
  AppLoadingSkeleton,
  FixedActionBar,
  FocusedBackAction,
} from "./app-shell";

interface PlanSourceScreenProps {
  readonly gateway?: PlanSourceGateway;
  readonly navigate?: (path: string) => void;
}

interface PlanSourceOption {
  readonly label: string;
  readonly meta: string;
  readonly support: string;
  readonly value: PlanSource;
}

const planSourceOptions: readonly PlanSourceOption[] = [
  {
    label: "Preciso de um profissional",
    meta: "Requer convite e verificação",
    support: "Conecte-se a um profissional que você já conhece.",
    value: "professional",
  },
  {
    label: "Importar planilha oficial",
    meta: "Precisa do arquivo .xlsx",
    support: "Traga um treino preenchido no modelo DayGym.",
    value: "official_xlsx",
  },
  {
    label: "Montar meu treino",
    meta: "Você escolhe cada exercício",
    support: "Crie a primeira sessão do seu jeito.",
    value: "manual",
  },
];

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export function PlanSourceScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: PlanSourceScreenProps) {
  const gatewayRef = useRef<PlanSourceGateway | undefined>(providedGateway);
  const [state, setState] = useState<PlanSourceState>();
  const [feedback, setFeedback] = useState<string>();
  const [savingSource, setSavingSource] = useState<PlanSource>();

  function gateway() {
    gatewayRef.current ??= createWebPlanSourceGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    void gateway()
      .load()
      .then((result) => {
        if (!result.ok) {
          if (result.reason === "session") {
            navigate("/entrar/");
            return;
          }
          setFeedback("Não foi possível carregar suas opções.");
          return;
        }

        if (!result.value.onboardingCompleted) {
          navigate("/comecar/");
          return;
        }

        const isChanging = new URL(window.location.href).searchParams.has(
          "alterar",
        );
        if (result.value.source && !isChanging) {
          navigate("/hoje/");
          return;
        }

        setState(result.value);
      });
  }, [navigate]);

  async function selectSource(source: PlanSource) {
    if (!state || savingSource || state.source === source) {
      return;
    }

    setFeedback(undefined);
    setSavingSource(source);
    const result = await gateway().select(source);
    setSavingSource(undefined);

    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setFeedback("Não foi possível salvar sua escolha. Tente novamente.");
      return;
    }

    setState(result.value);
    setFeedback("Escolha salva.");
  }

  return (
    <main className="onboarding-shell onboarding-shell-focused">
      <FocusedBackAction href="/hoje/" />
      <section className="onboarding-card plan-source-panel">
        <p className="eyebrow">Seu plano</p>
        <h1>Como você quer começar?</h1>
        <p className="support">
          Escolha um caminho. Você pode trocar antes do primeiro treino.
        </p>

        {state ? (
          <div className="plan-source-list">
            {planSourceOptions.map((option) => {
              const selected = state.source === option.value;
              const saving = savingSource === option.value;
              return (
                <button
                  aria-pressed={selected}
                  className="plan-source-option"
                  data-selected={selected || undefined}
                  disabled={savingSource !== undefined}
                  key={option.value}
                  onClick={() => void selectSource(option.value)}
                  type="button"
                >
                  <span className="plan-source-copy">
                    <strong>{option.label}</strong>
                    <span>{option.support}</span>
                    <small>{option.meta}</small>
                  </span>
                  <span className="plan-source-state" aria-hidden="true">
                    {saving ? "Salvando…" : selected ? "Escolhido" : "Escolher"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : feedback ? (
          <div className="onboarding-loading plan-source-loading" role="alert">
            {feedback}
          </div>
        ) : (
          <AppLoadingSkeleton label="Carregando opções de plano" />
        )}

        {state && feedback ? (
          <p
            className={
              feedback === "Escolha salva."
                ? "status-message status-success"
                : "status-message status-error"
            }
            role={feedback === "Escolha salva." ? "status" : "alert"}
          >
            {feedback}
          </p>
        ) : null}
      </section>
      {state?.source ? (
        <FixedActionBar>
          <Link className="button-primary" href="/hoje/">
            Continuar para Hoje
          </Link>
        </FixedActionBar>
      ) : null}
    </main>
  );
}
