"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PlanSource,
  PlanSourceGateway,
  PlanSourceState,
} from "@daygym/contracts";

import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";

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
    label: "Usar sugestão DayGym",
    meta: "Poucos minutos · sem arquivo",
    support: "Comece com um plano baseado nas suas respostas.",
    value: "daygym_suggestion",
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
  {
    label: "Receber de profissional",
    meta: "Precisa de um convite",
    support: "Acompanhe um plano enviado por um profissional.",
    value: "professional",
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
    <main className="onboarding-shell">
      <header className="product-header">
        <Link className="brand" href="/hoje/" aria-label="DayGym — Hoje">
          DayGym
        </Link>
        <Link href="/hoje/">Hoje</Link>
      </header>
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
        ) : (
          <div
            className="onboarding-loading plan-source-loading"
            aria-live="polite"
          >
            {feedback ?? "Carregando opções…"}
          </div>
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

        {state?.source ? (
          <Link className="button-primary plan-source-continue" href="/hoje/">
            Continuar para Hoje
          </Link>
        ) : null}
      </section>
    </main>
  );
}
