"use client";

import { useEffect, useRef, useState } from "react";

import type {
  OnboardingContext,
  OnboardingEquipmentContext,
  OnboardingExperience,
  OnboardingGateway,
  OnboardingGoal,
  OnboardingLimitationStatus,
  OnboardingSessionDuration,
  OnboardingStep,
} from "@daygym/contracts";

import { createWebOnboardingGateway } from "../../lib/onboarding-gateway";
import {
  AppLoadingSkeleton,
  FixedActionBar,
  FocusedBackAction,
} from "./app-shell";

type AnswerValue =
  | OnboardingEquipmentContext
  | OnboardingExperience
  | OnboardingGoal
  | OnboardingLimitationStatus
  | OnboardingSessionDuration
  | number;

interface ChoiceOption {
  readonly label: string;
  readonly support?: string;
  readonly value: AnswerValue;
}

interface StepDefinition {
  readonly eyebrow: string;
  readonly options: readonly ChoiceOption[];
  readonly support: string;
  readonly title: string;
}

interface OnboardingScreenProps {
  readonly gateway?: OnboardingGateway;
  readonly navigate?: (path: string) => void;
}

const stepDefinitions: readonly StepDefinition[] = [
  {
    eyebrow: "Seu objetivo",
    title: "O que mais importa agora?",
    support: "Escolha um objetivo principal. Você poderá ajustar depois.",
    options: [
      { label: "Perder gordura", value: "fat_loss" },
      { label: "Ganhar massa muscular", value: "hypertrophy" },
      { label: "Aumentar força", value: "strength" },
      { label: "Melhorar o condicionamento", value: "conditioning" },
      { label: "Voltar a treinar com saúde", value: "health_return" },
    ],
  },
  {
    eyebrow: "Sua experiência",
    title: "Como é sua rotina de treino hoje?",
    support: "Considere sua prática, não seu desempenho.",
    options: [
      {
        label: "Iniciante",
        support: "Estou começando ou ainda aprendendo os movimentos.",
        value: "beginner",
      },
      {
        label: "Intermediário",
        support: "Já sigo treinos e consigo ajustar minhas cargas.",
        value: "intermediate",
      },
      {
        label: "Avançado",
        support: "Tenho rotina consistente e técnica consolidada.",
        value: "advanced",
      },
    ],
  },
  {
    eyebrow: "Sua semana",
    title: "Quantos dias você consegue treinar?",
    support: "Três dias é um bom ponto de partida para a maioria das rotinas.",
    options: [2, 3, 4, 5].map((days) => ({
      label: `${days} dias por semana`,
      value: days,
    })),
  },
  {
    eyebrow: "Seu tempo",
    title: "Quanto tempo cabe em cada treino?",
    support: "Escolha uma duração que você consegue manter na prática.",
    options: [30, 45, 60, 75].map((minutes) => ({
      label: `${minutes} minutos`,
      value: minutes,
    })),
  },
  {
    eyebrow: "Onde você treina",
    title: "Quais equipamentos você costuma ter?",
    support: "Isso ajuda a evitar exercícios que não cabem na sua realidade.",
    options: [
      { label: "Academia completa", value: "full_gym" },
      { label: "Academia com poucos equipamentos", value: "limited_gym" },
      { label: "Equipamentos em casa", value: "home_equipment" },
      { label: "Somente peso do corpo", value: "bodyweight" },
    ],
  },
  {
    eyebrow: "Antes de avançar",
    title: "Algo limita seu treino hoje?",
    support: "Não precisamos de diagnóstico ou detalhes clínicos.",
    options: [
      { label: "Nada limita meu treino", value: "none" },
      { label: "Prefiro não informar agora", value: "not_informed" },
      {
        label: "Preciso de orientação profissional",
        support: "Tenho dor, desconforto ou outra condição que pede avaliação.",
        value: "needs_professional_review",
      },
    ],
  },
];

const answerLabels: Record<string, string> = Object.fromEntries(
  stepDefinitions.flatMap((step) =>
    step.options.map((option) => [String(option.value), option.label]),
  ),
);

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function answerForStep(
  context: OnboardingContext,
  step: number,
): AnswerValue | null {
  switch (step) {
    case 0:
      return context.goal;
    case 1:
      return context.experience;
    case 2:
      return context.weeklyDays;
    case 3:
      return context.sessionMinutes;
    case 4:
      return context.equipmentContext;
    case 5:
      return context.limitationStatus;
    default:
      return null;
  }
}

function withAnswer(
  context: OnboardingContext,
  step: number,
  answer: AnswerValue,
): OnboardingContext {
  switch (step) {
    case 0:
      return { ...context, goal: answer as OnboardingGoal };
    case 1:
      return { ...context, experience: answer as OnboardingExperience };
    case 2:
      return { ...context, weeklyDays: answer as number };
    case 3:
      return {
        ...context,
        sessionMinutes: answer as OnboardingSessionDuration,
      };
    case 4:
      return {
        ...context,
        equipmentContext: answer as OnboardingEquipmentContext,
      };
    case 5:
      return {
        ...context,
        limitationStatus: answer as OnboardingLimitationStatus,
      };
    default:
      return context;
  }
}

function progressAfterStep(
  step: number,
  current: OnboardingStep,
): OnboardingStep {
  return Math.max(current, step + 1) as OnboardingStep;
}

function completeDraft(context: OnboardingContext) {
  return (
    context.goal !== null &&
    context.experience !== null &&
    context.weeklyDays !== null &&
    context.sessionMinutes !== null &&
    context.equipmentContext !== null &&
    context.limitationStatus !== null
  );
}

export function OnboardingScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: OnboardingScreenProps) {
  const gatewayRef = useRef<OnboardingGateway | undefined>(providedGateway);
  const [context, setContext] = useState<OnboardingContext>();
  const [activeStep, setActiveStep] = useState<number>(0);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  function gateway() {
    gatewayRef.current ??= createWebOnboardingGateway();
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
          setFeedback(
            "Não foi possível carregar suas respostas. Tente novamente.",
          );
          return;
        }

        if (result.value.completedAt) {
          navigate("/hoje/");
          return;
        }

        setContext(result.value);
        setActiveStep(result.value.currentStep);
      });
  }, [navigate]);

  useEffect(() => {
    if (activeStep === 2 && context?.weeklyDays === null) {
      setContext({ ...context, weeklyDays: 3 });
    }
  }, [activeStep, context]);

  async function saveStep() {
    if (!context || answerForStep(context, activeStep) === null) {
      return;
    }

    setFeedback(undefined);
    setIsSaving(true);
    const nextStep = progressAfterStep(activeStep, context.currentStep);
    const result = await gateway().save({
      ...context,
      confirmed: false,
      currentStep: nextStep,
    });
    setIsSaving(false);

    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setFeedback("Não foi possível salvar agora. Tente novamente.");
      return;
    }

    setContext(result.value);
    setActiveStep(editingFromReview ? 6 : Math.min(activeStep + 1, 6));
    setEditingFromReview(false);
  }

  async function confirmAnswers() {
    if (!context || !completeDraft(context)) {
      return;
    }

    setFeedback(undefined);
    setIsSaving(true);
    const result = await gateway().save({
      ...context,
      confirmed: true,
      currentStep: 6,
    });
    setIsSaving(false);

    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setFeedback("Não foi possível confirmar agora. Tente novamente.");
      return;
    }

    navigate("/escolher-plano/");
  }

  function editStep(step: number) {
    setEditingFromReview(true);
    setFeedback(undefined);
    setActiveStep(step);
  }

  function returnToPreviousLevel() {
    setFeedback(undefined);
    if (editingFromReview) {
      setEditingFromReview(false);
      setActiveStep(6);
      return;
    }
    if (activeStep === 6) {
      setActiveStep(stepDefinitions.length - 1);
      return;
    }
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
      return;
    }
    navigate("/conta/");
  }

  if (!context) {
    return (
      <main className="onboarding-shell">
        {feedback ? (
          <div className="onboarding-loading" role="alert">
            {feedback}
          </div>
        ) : (
          <AppLoadingSkeleton label="Carregando seu treino" />
        )}
      </main>
    );
  }

  if (activeStep === 6) {
    return (
      <main className="onboarding-shell onboarding-shell-focused">
        <FocusedBackAction onClick={returnToPreviousLevel} />
        <section className="onboarding-card">
          <p className="eyebrow">Revisão</p>
          <h1>Confira suas respostas.</h1>
          <p className="support">Você pode editar antes de confirmar.</p>
          <div className="answer-review">
            {stepDefinitions.map((step, index) => {
              const answer = answerForStep(context, index);
              return (
                <div className="answer-row" key={step.eyebrow}>
                  <div>
                    <span>{step.eyebrow}</span>
                    <strong>{answerLabels[String(answer)]}</strong>
                  </div>
                  <button
                    className="button-text"
                    onClick={() => editStep(index)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
              );
            })}
          </div>
          {feedback ? (
            <p className="status-message status-error" role="alert">
              {feedback}
            </p>
          ) : null}
        </section>
        <FixedActionBar>
          <button
            className="button-primary"
            disabled={isSaving || !completeDraft(context)}
            onClick={() => void confirmAnswers()}
            type="button"
          >
            {isSaving ? "Confirmando…" : "Confirmar respostas"}
          </button>
        </FixedActionBar>
      </main>
    );
  }

  const step = stepDefinitions[activeStep];
  if (!step) {
    return (
      <main className="onboarding-shell">
        <div className="onboarding-loading" role="alert">
          Não foi possível abrir esta etapa.
        </div>
      </main>
    );
  }
  const selectedAnswer = answerForStep(context, activeStep);

  return (
    <main className="onboarding-shell onboarding-shell-focused">
      <FocusedBackAction onClick={returnToPreviousLevel} />
      <section className="onboarding-card">
        <div className="onboarding-progress">
          <span>
            Passo {activeStep + 1} de {stepDefinitions.length}
          </span>
          <progress
            aria-label={`Passo ${activeStep + 1} de ${stepDefinitions.length}`}
            max={stepDefinitions.length}
            value={activeStep + 1}
          />
        </div>
        <p className="eyebrow">{step.eyebrow}</p>
        <h1>{step.title}</h1>
        <p className="support">{step.support}</p>
        <fieldset className="choice-list">
          <legend className="sr-only">{step.title}</legend>
          {step.options.map((option) => {
            const selected = selectedAnswer === option.value;
            return (
              <label
                className="choice-card"
                data-selected={selected || undefined}
                key={String(option.value)}
              >
                <input
                  checked={selected}
                  name={`onboarding-step-${activeStep}`}
                  onChange={() =>
                    setContext((current) =>
                      current
                        ? withAnswer(current, activeStep, option.value)
                        : current,
                    )
                  }
                  type="radio"
                  value={String(option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.support ? <small>{option.support}</small> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        {feedback ? (
          <p className="status-message status-error" role="alert">
            {feedback}
          </p>
        ) : null}
      </section>
      <FixedActionBar>
        <button
          className="button-primary"
          disabled={isSaving || selectedAnswer === null}
          onClick={() => void saveStep()}
          type="button"
        >
          {isSaving
            ? "Salvando…"
            : editingFromReview
              ? "Salvar alteração"
              : "Continuar"}
        </button>
      </FixedActionBar>
    </main>
  );
}
