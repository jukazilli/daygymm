import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActiveTrainingRun,
  PracticalTrainingState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { ActiveTrainingScreen } from "./active-training-screen";

const plannedSession = {
  dayOrder: 1,
  items: [
    {
      circuitGroup: null,
      completedAt: null,
      distanceMeters: null,
      durationSeconds: null,
      exerciseName: "Agachamento",
      itemId: "71000000-0000-4000-8000-000000000001",
      modality: "strength" as const,
      notes: "Movimento controlado",
      order: 1,
      repsMax: 12,
      repsMin: 8,
      restSeconds: 90,
      sets: 3,
    },
  ],
  name: "Treino A",
  sessionId: "72000000-0000-4000-8000-000000000002",
};

const plan = {
  itemCount: 1,
  name: "Meu plano",
  planId: "73000000-0000-4000-8000-000000000003",
  sessionCount: 1,
  version: 1,
  versionId: "74000000-0000-4000-8000-000000000004",
  wasCreated: false,
};

function state(activeRun: ActiveTrainingRun | null): PracticalTrainingState {
  return {
    activeRun,
    lastCompletedAt: null,
    nextSession: activeRun?.session ?? plannedSession,
    plan,
    sessions: [plannedSession],
  };
}

afterEach(cleanup);

describe("ActiveTrainingScreen", () => {
  it("runs the imported session from start through completion", async () => {
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: new Date().toISOString(),
    };
    const completedRun: ActiveTrainingRun = {
      ...activeRun,
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            completedAt: new Date().toISOString(),
          },
        ],
      },
    };
    const gateway: TrainingSessionGateway = {
      completeExercise: vi.fn().mockResolvedValue({
        ok: true,
        value: { completedCount: 1, totalCount: 1, wasCreated: true },
      }),
      finish: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          completedAt: new Date().toISOString(),
          durationSeconds: 420,
          sessionId: activeRun.runId,
          wasCreated: true,
        },
      }),
      load: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: state(null) })
        .mockResolvedValueOnce({ ok: true, value: state(completedRun) }),
      start: vi.fn().mockResolvedValue({ ok: true, value: activeRun }),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    await user.click(
      await screen.findByRole("button", { name: "Iniciar treino" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Agachamento" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Concluir exercício" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Finalizar treino" }),
    );

    expect(await screen.findByText("Treino concluído.")).toBeTruthy();
    expect(gateway.start).toHaveBeenCalledWith(plannedSession.sessionId);
    expect(gateway.completeExercise).toHaveBeenCalledWith(
      activeRun.runId,
      plannedSession.items[0]?.itemId,
    );
    expect(gateway.finish).toHaveBeenCalledWith(activeRun.runId);
  });
});
