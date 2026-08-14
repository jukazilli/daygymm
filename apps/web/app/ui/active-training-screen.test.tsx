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
      plannedWeightKg: 40,
      repsMax: 12,
      repsMin: 8,
      restSeconds: 90,
      sets: 2,
      setExecutions: [],
      startedAt: null,
    },
  ],
  name: "Treino A",
  sessionId: "72000000-0000-4000-8000-000000000002",
  weekday: 1,
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
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const startedRun: ActiveTrainingRun = {
      ...activeRun,
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
    };
    const firstSetRun: ActiveTrainingRun = {
      ...startedRun,
      session: {
        ...startedRun.session,
        items: [
          {
            ...startedRun.session.items[0]!,
            setExecutions: [
              {
                actualDistanceMeters: null,
                actualDurationSeconds: null,
                actualReps: 12,
                actualWeightKg: 40,
                completedAt: "2026-08-14T03:32:00.000+00:00",
                plannedDistanceMeters: null,
                plannedDurationSeconds: null,
                plannedRepsMax: 12,
                plannedRepsMin: 8,
                plannedWeightKg: 40,
                setExecutionId: "76000000-0000-4000-8000-000000000006",
                setNumber: 1,
              },
            ],
          },
        ],
      },
    };
    const completedRun: ActiveTrainingRun = {
      ...firstSetRun,
      session: {
        ...firstSetRun.session,
        items: [
          {
            ...firstSetRun.session.items[0]!,
            completedAt: "2026-08-14T03:33:00.000+00:00",
            setExecutions: [
              ...firstSetRun.session.items[0]!.setExecutions,
              {
                ...firstSetRun.session.items[0]!.setExecutions[0]!,
                completedAt: "2026-08-14T03:33:00.000+00:00",
                setExecutionId: "77000000-0000-4000-8000-000000000007",
                setNumber: 2,
              },
            ],
          },
        ],
      },
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeSet: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          value: {
            completedAt: "2026-08-14T03:32:00.000+00:00",
            completedSetCount: 1,
            exerciseCompleted: false,
            setExecutionId: "76000000-0000-4000-8000-000000000006",
            setNumber: 1,
            totalSets: 2,
            wasCreated: true,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          value: {
            completedAt: "2026-08-14T03:33:00.000+00:00",
            completedSetCount: 2,
            exerciseCompleted: true,
            setExecutionId: "77000000-0000-4000-8000-000000000007",
            setNumber: 2,
            totalSets: 2,
            wasCreated: true,
          },
        }),
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
        .mockResolvedValueOnce({ ok: true, value: state(startedRun) })
        .mockResolvedValueOnce({ ok: true, value: state(firstSetRun) })
        .mockResolvedValueOnce({ ok: true, value: state(completedRun) }),
      start: vi.fn().mockResolvedValue({ ok: true, value: activeRun }),
      pause: vi.fn(),
      resume: vi.fn(),
      startExercise: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          nextSetNumber: 1,
          startedAt: "2026-08-14T03:31:00.000+00:00",
          totalSets: 2,
          wasCreated: true,
        },
      }),
    };

    render(
      createElement(ActiveTrainingScreen, {
        gateway,
        plannedSessionId: plannedSession.sessionId,
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Iniciar treino" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Agachamento" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Iniciar Agachamento" }),
    );
    expect(
      (
        await screen.findByRole("spinbutton", { name: "Repetições" })
      ).getAttribute("value"),
    ).toBe("12");
    await user.click(screen.getByRole("button", { name: "Concluir série" }));
    expect(await screen.findByText("Série 2 de 2")).toBeTruthy();
    expect(screen.getByText("✓ Série 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Concluir série" }));
    await user.click(
      await screen.findByRole("button", { name: "Finalizar treino" }),
    );

    expect(await screen.findByText("Treino concluído.")).toBeTruthy();
    expect(gateway.start).toHaveBeenCalledWith(plannedSession.sessionId);
    expect(gateway.load).toHaveBeenNthCalledWith(1, plannedSession.sessionId);
    expect(gateway.startExercise).toHaveBeenCalledWith(
      activeRun.runId,
      plannedSession.items[0]?.itemId,
    );
    expect(gateway.completeSet).toHaveBeenCalledTimes(2);
    expect(gateway.finish).toHaveBeenCalledWith(activeRun.runId);
  });

  it("pauses an active training only after confirming in the dialog", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn().mockResolvedValue({
        ok: true,
        value: { runId: activeRun.runId, wasCancelled: true },
      }),
      completeSet: vi.fn(),
      completeExercise: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          pausedAt: "2026-08-14T03:35:00.000+00:00",
          pausedDurationSeconds: 0,
          runId: activeRun.runId,
          wasChanged: true,
        },
      }),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway, navigate }));

    await user.click(await screen.findByRole("button", { name: "Pausar" }));
    expect(screen.getByRole("dialog", { name: "Pausar treino?" })).toBeTruthy();
    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(gateway.pause).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pausar treino" }));

    expect(gateway.pause).toHaveBeenCalledWith(activeRun.runId);
    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/treinos/");
  });

  it("uses duration for a circuit exercise without rendering null repetitions", async () => {
    const timedSession = {
      ...plannedSession,
      items: [
        {
          ...plannedSession.items[0]!,
          circuitGroup: "Circuito abdominal",
          durationSeconds: 30,
          exerciseName: "Prancha lateral",
          modality: "circuit" as const,
          plannedWeightKg: null,
          repsMax: null,
          repsMin: null,
          setExecutions: [],
          startedAt: "2026-08-14T03:31:00.000+00:00",
        },
      ],
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: timedSession,
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...state(null),
          activeRun,
          nextSession: timedSession,
          sessions: [timedSession],
        },
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    const duration = await screen.findByRole("spinbutton", {
      name: "Tempo segundos",
    });
    expect(duration.getAttribute("value")).toBe("30");
    expect(screen.queryByText(/null/i)).toBeNull();
    expect(screen.getByText("2 séries · 30 s")).toBeTruthy();
  });
});
