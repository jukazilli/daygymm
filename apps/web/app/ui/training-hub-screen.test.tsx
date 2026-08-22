import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PlanSourceGateway,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { TrainingHubScreen } from "./training-hub-screen";

function createTrainingGateway(
  value: Awaited<ReturnType<TrainingSessionGateway["load"]>>,
): TrainingSessionGateway {
  return {
    cancel: vi.fn(),
    completeSet: vi.fn(),
    completeExercise: vi.fn(),
    finish: vi.fn(),
    load: vi.fn().mockResolvedValue(value),
    pause: vi.fn(),
    reviseSet: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
    startExercise: vi.fn(),
  };
}

function sourceGateway(source: "manual" | "official_xlsx"): PlanSourceGateway {
  return {
    load: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        onboardingCompleted: true,
        selectedAt: "2026-08-14T17:00:00.000Z",
        source,
      },
    }),
    select: vi.fn(),
  };
}

function unavailableSourceGateway(): PlanSourceGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: false, reason: "unexpected" }),
    select: vi.fn(),
  };
}

afterEach(cleanup);

describe("TrainingHubScreen", () => {
  it("opens the official importer when the selected path has no plan", async () => {
    render(
      createElement(TrainingHubScreen, {
        gateway: sourceGateway("official_xlsx"),
        trainingGateway: createTrainingGateway({
          ok: true,
          value: {
            activeRun: null,
            lastCompletedAt: null,
            nextSession: null,
            plan: null,
            sessions: [],
          },
        }),
      }),
    );

    expect(await screen.findByText("Importe seu primeiro plano.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Importar planilha" })
        .getAttribute("href"),
    ).toBe("/treinos/importar");
  });

  it("opens manual authoring when the selected path has no plan", async () => {
    render(
      createElement(TrainingHubScreen, {
        gateway: sourceGateway("manual"),
        trainingGateway: createTrainingGateway({
          ok: true,
          value: {
            activeRun: null,
            lastCompletedAt: null,
            nextSession: null,
            plan: null,
            sessions: [],
          },
        }),
      }),
    );

    expect(await screen.findByText("Monte seu primeiro plano.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Montar plano" }).getAttribute("href"),
    ).toBe("/treinos/planos");
  });

  it("makes My trainings the only highlighted action in the training hub", async () => {
    const plannedSession = {
      dayOrder: 1,
      items: [
        {
          approvedAlternatives: [],
          circuitGroup: null,
          completedAt: null,
          distanceMeters: null,
          durationSeconds: null,
          exerciseName: "Supino",
          itemId: "61000000-0000-4000-8000-000000000001",
          modality: "strength" as const,
          notes: null,
          order: 1,
          plannedExerciseName: "Supino",
          plannedWeightKg: null,
          previousSetReferences: [],
          repsMax: 12,
          repsMin: 8,
          restSeconds: 90,
          setProgressionKg: null,
          sets: 3,
          setExecutions: [],
          startedAt: null,
          substitution: null,
        },
      ],
      name: "Treino A",
      sessionId: "62000000-0000-4000-8000-000000000002",
      weekday: 1,
    };

    render(
      createElement(TrainingHubScreen, {
        gateway: sourceGateway("official_xlsx"),
        trainingGateway: createTrainingGateway({
          ok: true,
          value: {
            activeRun: null,
            lastCompletedAt: null,
            nextSession: plannedSession,
            plan: {
              itemCount: 1,
              name: "Meu plano",
              planId: "63000000-0000-4000-8000-000000000003",
              sessionCount: 1,
              version: 1,
              versionId: "64000000-0000-4000-8000-000000000004",
              wasCreated: false,
            },
            sessions: [plannedSession],
          },
        }),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Meus treinos" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Abrir meus treinos/ })
        .getAttribute("href"),
    ).toBe("/treinos/meus");
    expect(screen.getAllByRole("link", { name: /Criar treino/ })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("link", { name: /Criar treino/ }).getAttribute("href"),
    ).toBe("/treinos/planos");
    expect(
      screen
        .getByRole("link", { name: /Configurar cargas/ })
        .getAttribute("href"),
    ).toBe("/treinos/cargas");
    expect(
      screen.getByRole("link", { name: /Histórico/ }).getAttribute("href"),
    ).toBe("/treinos/historico");
    expect(screen.queryByText("Treino de hoje")).toBeNull();
    expect(screen.queryByRole("link", { name: /Abrir treino$/ })).toBeNull();
    expect(screen.queryByText("Agenda semanal")).toBeNull();
  });

  it("keeps a local plan usable when plan-source metadata is offline", async () => {
    const session = {
      dayOrder: 1,
      items: [],
      name: "Treino offline",
      sessionId: "65000000-0000-4000-8000-000000000005",
      weekday: 1,
    };

    render(
      createElement(TrainingHubScreen, {
        gateway: unavailableSourceGateway(),
        trainingGateway: createTrainingGateway({
          ok: true,
          value: {
            activeRun: null,
            lastCompletedAt: null,
            nextSession: session,
            plan: {
              itemCount: 0,
              name: "Plano local",
              planId: "66000000-0000-4000-8000-000000000006",
              sessionCount: 1,
              version: 1,
              versionId: "67000000-0000-4000-8000-000000000007",
              wasCreated: false,
            },
            sessions: [session],
          },
        }),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Meus treinos" }),
    ).toBeTruthy();
    expect(screen.queryByText("Não foi possível carregar.")).toBeNull();
  });
});
