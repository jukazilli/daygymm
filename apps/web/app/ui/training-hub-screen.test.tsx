import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PlanSourceGateway,
  TrainingPlanGateway,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { TrainingHubScreen } from "./training-hub-screen";

function createTrainingGateway(
  value: Awaited<ReturnType<TrainingSessionGateway["load"]>>,
): TrainingSessionGateway {
  return {
    cancel: vi.fn(),
    completeExercise: vi.fn(),
    finish: vi.fn(),
    load: vi.fn().mockResolvedValue(value),
    start: vi.fn(),
  };
}

afterEach(cleanup);

describe("TrainingHubScreen", () => {
  it("opens the official importer when the selected path has no plan", async () => {
    const gateway: PlanSourceGateway = {
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        },
      }),
      select: vi.fn(),
    };
    const trainingGateway = createTrainingGateway({
      ok: true,
      value: {
        activeRun: null,
        lastCompletedAt: null,
        nextSession: null,
        plan: null,
        sessions: [],
      },
    });

    render(createElement(TrainingHubScreen, { gateway, trainingGateway }));

    expect(await screen.findByText("Importe seu primeiro plano.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Importar planilha" })
        .getAttribute("href"),
    ).toBe("/treinos/importar");
  });

  it("makes an imported plan executable", async () => {
    const user = userEvent.setup();
    const gateway: PlanSourceGateway = {
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        },
      }),
      select: vi.fn(),
    };
    const plannedSession = {
      dayOrder: 1,
      items: [
        {
          circuitGroup: null,
          completedAt: null,
          distanceMeters: null,
          durationSeconds: null,
          exerciseName: "Supino",
          itemId: "61000000-0000-4000-8000-000000000001",
          modality: "strength" as const,
          notes: null,
          order: 1,
          repsMax: 12,
          repsMin: 8,
          restSeconds: 90,
          sets: 3,
        },
      ],
      name: "Treino A",
      sessionId: "62000000-0000-4000-8000-000000000002",
      weekday: 1,
    };
    const trainingGateway = createTrainingGateway({
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
    });
    const trainingPlanGateway: TrainingPlanGateway = {
      importOfficialXlsx: vi.fn(),
      loadActive: vi.fn(),
      rename: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          name: "Treino - 14/08/2026",
          planId: "63000000-0000-4000-8000-000000000003",
        },
      }),
    };

    render(
      createElement(TrainingHubScreen, {
        gateway,
        trainingGateway,
        trainingPlanGateway,
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Treino A" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir treino" }).getAttribute("href"),
    ).toBe("/treinos/sessao?sessao=62000000-0000-4000-8000-000000000002");
    expect(screen.getByText("Agenda semanal")).toBeTruthy();
    expect(screen.getByText("Segunda")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Editar nome" }));
    const nameField = screen.getByRole("textbox", { name: "Nome do treino" });
    await user.clear(nameField);
    await user.type(nameField, "Treino - 14/08/2026");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    expect(
      await screen.findByRole("heading", { name: "Treino - 14/08/2026" }),
    ).toBeTruthy();
    expect(trainingPlanGateway.rename).toHaveBeenCalledWith(
      "63000000-0000-4000-8000-000000000003",
      "Treino - 14/08/2026",
    );
  });
});
