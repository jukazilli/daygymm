import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActiveTrainingRun,
  LocalFirstTrainingSessionGateway,
  PracticalTrainingState,
  TrainingSessionGateway,
  TrainingSessionSyncState,
} from "@daygym/contracts";

import { ActiveTrainingScreen } from "./active-training-screen";

const plannedSession = {
  dayOrder: 1,
  items: [
    {
      approvedAlternatives: [],
      circuitGroup: null,
      completedAt: null,
      distanceMeters: null,
      durationSeconds: null,
      exerciseName: "Agachamento",
      itemId: "71000000-0000-4000-8000-000000000001",
      modality: "strength" as const,
      notes: "Movimento controlado",
      order: 1,
      plannedExerciseName: "Agachamento",
      plannedWeightKg: 40,
      previousSetReferences: [
        {
          actualDistanceMeters: null,
          actualDurationSeconds: null,
          actualReps: 10,
          actualWeightKg: 37.5,
          completedAt: "2026-08-11T03:32:00.000+00:00",
          setNumber: 1,
          sourceSessionId: "70000000-0000-4000-8000-000000000009",
        },
      ],
      repsMax: 12,
      repsMin: 8,
      restSeconds: 90,
      setProgressionKg: 2.5,
      sets: 2,
      setExecutions: [],
      startedAt: null,
      substitution: null,
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

async function openActiveExercise(
  user: ReturnType<typeof userEvent.setup>,
  exerciseName = "Agachamento",
) {
  await user.click(
    await screen.findByRole("button", { name: `Abrir ${exerciseName}` }),
  );
}

async function openSetAdjustment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Ajustar série anterior" }),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ActiveTrainingScreen", () => {
  it("uses only an approved alternative and keeps the planned exercise visible", async () => {
    window.localStorage.setItem("daygym:exercise-swipe-tutorial:v1", "seen");
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            approvedAlternatives: [
              {
                alternativeId: "78000000-0000-4000-8000-000000000008",
                exerciseName: "Leg press 45",
                order: 1,
              },
            ],
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.000Z",
    };
    const substituteExercise = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        alternativeId: "78000000-0000-4000-8000-000000000008",
        exerciseName: "Leg press 45",
        plannedExerciseName: "Agachamento",
        reason: "equipment_unavailable",
        substitutedAt: "2026-08-14T03:31:00.000Z",
        wasCreated: true,
      },
    });
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
      substituteExercise,
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);
    await user.click(
      screen.getByRole("button", { name: "Trocar Agachamento" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Trocar exercício" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar troca" }));

    expect(substituteExercise).toHaveBeenCalledWith({
      alternativeId: "78000000-0000-4000-8000-000000000008",
      itemId: plannedSession.items[0]!.itemId,
      reason: "equipment_unavailable",
      runId: activeRun.runId,
    });
    expect(await screen.findByText("Leg press 45")).toBeTruthy();
    expect(screen.getByText("No lugar de Agachamento")).toBeTruthy();
  });

  it("runs the imported session from start through completion", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-14T03:32:00.000Z").getTime(),
    );
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
                revision: 1,
                setExecutionId: "76000000-0000-4000-8000-000000000006",
                setNumber: 1,
                updatedAt: "2026-08-14T03:32:00.000+00:00",
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
          completedSetCount: 2,
          completionStatus: "complete",
          durationSeconds: 420,
          plannedSetCount: 2,
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
      reviseSet: vi.fn(),
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
      await screen.findByRole("button", { name: "Começar por Agachamento" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Agachamento" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Iniciar Agachamento" }),
    );
    expect(await screen.findByText("Executando agora…")).toBeTruthy();
    expect(screen.queryByLabelText(/Tempo de treino/)).toBeNull();
    expect(screen.queryByText("Treino A")).toBeNull();
    expect(await screen.findByText("Série e repetições")).toBeTruthy();
    expect(await screen.findByText(/Última vez/)).toBeTruthy();
    expect(screen.getByText(/37,5 kg × 10 repetições/)).toBeTruthy();
    expect(
      (
        await screen.findByRole("spinbutton", { name: "Repetições" })
      ).getAttribute("value"),
    ).toBe("12");
    expect(
      screen
        .getByRole("spinbutton", { name: "Carga kg" })
        .getAttribute("value"),
    ).toBe("40");
    await user.click(
      screen.getByRole("button", {
        name: "Concluir série e iniciar descanso",
      }),
    );
    expect(screen.getByText("01:30")).toBeTruthy();
    const continueRest = screen.getByRole("button", {
      name: "Concluir descanso e continuar",
    });
    const finishFromRest = screen.getByRole("button", {
      name: "Finalizar treino",
    });
    expect(continueRest.closest(".exercise-control-bar")).toBe(
      finishFromRest.closest(".exercise-control-bar"),
    );
    expect(finishFromRest.querySelector("svg")).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Adicionar 30 segundos" }),
    );
    expect(await screen.findByText("02:00")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Concluir descanso e continuar",
      }),
    );
    expect(await screen.findByText("2 de 2")).toBeTruthy();
    expect(screen.queryByText("Planejado")).toBeNull();
    expect(screen.queryByText("Realizado")).toBeNull();
    expect(
      screen
        .getByRole("spinbutton", { name: "Carga kg" })
        .getAttribute("value"),
    ).toBe("42.5");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Carga kg" }), {
      target: { value: "40" },
    });
    expect(
      screen
        .getByRole("spinbutton", { name: "Carga kg" })
        .getAttribute("value"),
    ).toBe("40");
    await user.click(
      screen.getByRole("button", {
        name: "Concluir série e iniciar descanso",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Finalizar treino" }),
    );

    expect(await screen.findByText("Treino concluído.")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("2 de 2 séries")).toBeTruthy();
    expect(screen.getByText("960 kg")).toBeTruthy();
    expect(gateway.start).toHaveBeenCalledWith(plannedSession.sessionId);
    expect(gateway.load).toHaveBeenNthCalledWith(1, plannedSession.sessionId);
    expect(gateway.startExercise).toHaveBeenCalledWith(
      activeRun.runId,
      plannedSession.items[0]?.itemId,
    );
    expect(gateway.completeSet).toHaveBeenCalledTimes(2);
    expect(gateway.completeSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ actualWeightKg: 40, setNumber: 2 }),
    );
    expect(gateway.finish).toHaveBeenCalledWith(activeRun.runId, "complete");
  });

  it("guides an explicit partial finish and shows the pending sets", async () => {
    const user = userEvent.setup();
    const performedSet = {
      actualDistanceMeters: null,
      actualDurationSeconds: null,
      actualReps: 10,
      actualWeightKg: 40,
      completedAt: "2026-08-14T03:32:00.000+00:00",
      plannedDistanceMeters: null,
      plannedDurationSeconds: null,
      plannedRepsMax: 12,
      plannedRepsMin: 8,
      plannedWeightKg: 40,
      revision: 1,
      setExecutionId: "76000000-0000-4000-8000-000000000006",
      setNumber: 1,
      updatedAt: "2026-08-14T03:32:00.000+00:00",
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            setExecutions: [performedSet],
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const finish = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        completedAt: "2026-08-14T03:35:00.000+00:00",
        completedSetCount: 1,
        completionStatus: "partial",
        durationSeconds: 300,
        plannedSetCount: 2,
        sessionId: activeRun.runId,
        wasCreated: true,
      },
    });
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish,
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    await user.click(
      await screen.findByRole("button", { name: "Finalizar treino" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Ainda há séries pendentes" }),
    ).toBeTruthy();
    expect(screen.getByText("Você concluiu 1 de 2 séries.")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Revisar pendências" }),
    );
    expect(finish).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finalizar treino" }));
    await user.click(
      screen.getByRole("button", { name: "Concluir parcialmente" }),
    );

    expect(
      await screen.findByText("Treino concluído parcialmente."),
    ).toBeTruthy();
    expect(screen.getByText("1 série")).toBeTruthy();
    expect(finish).toHaveBeenCalledWith(activeRun.runId, "partial");
  });

  it("keeps a confirmed set successful without a full readback", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-14T03:32:00.000Z").getTime(),
    );
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: state(activeRun) })
      .mockResolvedValue({ ok: false, reason: "unexpected" });
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn().mockResolvedValue({
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
      }),
      finish: vi.fn(),
      load,
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);
    await user.click(
      await screen.findByRole("button", {
        name: "Concluir série e iniciar descanso",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Concluir descanso e continuar",
      }),
    );

    expect(await screen.findByText("2 de 2")).toBeTruthy();
    expect(screen.queryByText("Não foi possível salvar agora.")).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });

  it("shows that an offline set is safe on this device and can be retried", async () => {
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    let notifySyncState:
      ((state: TrainingSessionSyncState) => void) | undefined;
    const synchronize = vi.fn().mockResolvedValue(undefined);
    const gateway: LocalFirstTrainingSessionGateway = {
      adjustRest: vi.fn(),
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn().mockImplementation(async () => {
        notifySyncState?.({
          lastSyncedAt: null,
          pendingCount: 1,
          status: "offline",
        });
        return {
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
        };
      }),
      dismissRest: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...state(activeRun), activeRest: null },
      }),
      finish: vi.fn(),
      getSyncState: () => ({
        lastSyncedAt: null,
        pendingCount: 0,
        status: "synced",
      }),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn(),
      resolveConflict: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
      substituteExercise: vi.fn(),
      subscribeSyncState(listener) {
        notifySyncState = listener;
        listener(this.getSyncState());
        return () => {
          notifySyncState = undefined;
        };
      },
      synchronize,
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);
    await user.click(
      await screen.findByRole("button", {
        name: "Concluir série e iniciar descanso",
      }),
    );

    expect(await screen.findByLabelText(/Salvo neste aparelho/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: /Sincronizar 1 registro pendente/,
      }),
    );
    expect(synchronize).toHaveBeenCalledOnce();
  });

  it("teaches swipe once and navigates without visible arrows or changing completion", async () => {
    const user = userEvent.setup();
    const multiExerciseSession = {
      ...plannedSession,
      items: [
        plannedSession.items[0]!,
        {
          ...plannedSession.items[0]!,
          exerciseName: "Mesa flexora",
          itemId: "71000000-0000-4000-8000-000000000002",
          order: 2,
          previousSetReferences: [],
        },
      ],
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: multiExerciseSession,
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...state(activeRun),
          nextSession: multiExerciseSession,
          sessions: [multiExerciseSession],
        },
      }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    await openActiveExercise(user);

    expect(
      await screen.findByRole("dialog", { name: "Navegue com um gesto." }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Entendi" }));

    const exerciseSurface = await screen.findByRole("region", {
      name: /Agachamento, série 1 de 2/,
    });
    fireEvent.touchStart(exerciseSurface!, {
      touches: [{ clientX: 280, clientY: 320 }],
    });
    fireEvent.touchEnd(exerciseSurface!, {
      changedTouches: [{ clientX: 120, clientY: 325 }],
    });
    expect(
      await screen.findByRole("heading", { name: "Mesa flexora" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Exercício anterior" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Próximo exercício" }),
    ).toBeNull();

    fireEvent.keyDown(exerciseSurface!, { key: "ArrowLeft" });
    expect(
      await screen.findByRole("heading", { name: "Agachamento" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Pular para o próximo exercício" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Mesa flexora" }),
    ).toBeTruthy();
    expect(gateway.startExercise).not.toHaveBeenCalled();
    expect(gateway.completeExercise).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Voltar para a lista de exercícios",
      }),
    );
    expect(
      screen.getByRole("list", { name: "Exercícios do treino" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "O que fazer com este treino?" }),
    ).toBeNull();
  });

  it("returns to the list after the last set and exposes the next exercise", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-14T03:32:00.000Z").getTime(),
    );
    const user = userEvent.setup();
    const firstExercise = {
      ...plannedSession.items[0]!,
      sets: 1,
      startedAt: "2026-08-14T03:31:00.000+00:00",
    };
    const nextExercise = {
      ...plannedSession.items[0]!,
      exerciseName: "Mesa flexora",
      itemId: "71000000-0000-4000-8000-000000000002",
      order: 2,
      previousSetReferences: [],
    };
    const multiExerciseSession = {
      ...plannedSession,
      items: [firstExercise, nextExercise],
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: multiExerciseSession,
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          completedAt: "2026-08-14T03:32:00.000Z",
          completedSetCount: 1,
          exerciseCompleted: true,
          setExecutionId: "76000000-0000-4000-8000-000000000006",
          setNumber: 1,
          totalSets: 1,
          wasCreated: true,
        },
      }),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...state(activeRun),
          nextSession: multiExerciseSession,
          sessions: [multiExerciseSession],
        },
      }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);
    await user.click(
      screen.getByRole("button", {
        name: "Concluir série e iniciar descanso",
      }),
    );

    expect(
      await screen.findByRole("list", { name: "Exercícios do treino" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Abrir Mesa flexora" }),
    ).toBeTruthy();
    expect(screen.queryByText("Exercício concluído")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /Voltar ao descanso/ }),
    );
    expect(screen.getByRole("heading", { name: "Descanso" })).toBeTruthy();
    expect(screen.getByText("Próximo · Mesa flexora")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Concluir descanso e continuar",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Mesa flexora" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Iniciar Mesa flexora" }),
    ).toBeTruthy();
  });

  it("keeps a blocked sync visible until the user chooses a recovery", async () => {
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const canonical = state(activeRun);
    const resolveConflict = vi.fn().mockResolvedValue({
      ok: true,
      value: canonical,
    });
    const gateway: LocalFirstTrainingSessionGateway = {
      adjustRest: vi.fn(),
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      dismissRest: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...canonical, activeRest: null },
      }),
      finish: vi.fn(),
      getSyncState: () => ({
        lastSyncedAt: null,
        pendingCount: 1,
        status: "conflict",
      }),
      load: vi.fn().mockResolvedValue({ ok: true, value: canonical }),
      pause: vi.fn(),
      resolveConflict,
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
      substituteExercise: vi.fn(),
      subscribeSyncState(listener) {
        listener(this.getSyncState());
        return () => undefined;
      },
      synchronize: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await user.click(
      await screen.findByRole("button", {
        name: "Resolver sincronização bloqueada",
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Não foi possível sincronizar.",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Usar versão online" }),
    );
    expect(resolveConflict).toHaveBeenCalledWith("use-server");
  });

  it("reconciles the rest and training clocks immediately after foregrounding", async () => {
    const initialNow = new Date("2026-08-14T03:32:00.000Z").getTime();
    const now = vi.spyOn(Date, "now").mockReturnValue(initialNow);
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            setExecutions: [
              {
                actualDistanceMeters: null,
                actualDurationSeconds: null,
                actualReps: 10,
                actualWeightKg: 40,
                completedAt: "2026-08-14T03:32:00.000Z",
                plannedDistanceMeters: null,
                plannedDurationSeconds: null,
                plannedRepsMax: 12,
                plannedRepsMin: 8,
                plannedWeightKg: 40,
                revision: 1,
                setExecutionId: "76000000-0000-4000-8000-000000000006",
                setNumber: 1,
                updatedAt: "2026-08-14T03:32:00.000Z",
              },
            ],
            startedAt: "2026-08-14T03:30:00.000Z",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.000Z",
    };
    const restored = {
      ...state(activeRun),
      activeRest: {
        durationSeconds: 90,
        endsAt: "2026-08-14T03:33:30.000Z",
        nextItemId: plannedSession.items[0]!.itemId,
        runId: activeRun.runId,
        setNumber: 1,
        sourceItemId: plannedSession.items[0]!.itemId,
      },
    } satisfies PracticalTrainingState;
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: restored }),
      pause: vi.fn(),
      resolveConflict: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    } as TrainingSessionGateway;

    render(createElement(ActiveTrainingScreen, { gateway }));

    expect(await screen.findByText("01:30")).toBeTruthy();
    expect(screen.queryByLabelText(/Tempo de treino/)).toBeNull();

    now.mockReturnValue(initialNow + 60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(await screen.findByText("00:30")).toBeTruthy();
    expect(screen.queryByLabelText(/Tempo de treino/)).toBeNull();
  });

  it("corrects and undoes the latest persisted set from its focused dialog", async () => {
    const user = userEvent.setup();
    const performedSet = {
      actualDistanceMeters: null,
      actualDurationSeconds: null,
      actualReps: 10,
      actualWeightKg: 40,
      completedAt: "2026-08-14T03:32:00.000+00:00",
      plannedDistanceMeters: null,
      plannedDurationSeconds: null,
      plannedRepsMax: 12,
      plannedRepsMin: 8,
      plannedWeightKg: 40,
      revision: 1,
      setExecutionId: "76000000-0000-4000-8000-000000000006",
      setNumber: 1,
      updatedAt: "2026-08-14T03:32:00.000+00:00",
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            setExecutions: [performedSet],
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const correctedRun: ActiveTrainingRun = {
      ...activeRun,
      session: {
        ...activeRun.session,
        items: [
          {
            ...activeRun.session.items[0]!,
            setExecutions: [
              {
                ...performedSet,
                actualWeightKg: 42,
                revision: 2,
                updatedAt: "2026-08-14T03:34:00.000+00:00",
              },
            ],
          },
        ],
      },
    };
    const undoneRun: ActiveTrainingRun = {
      ...activeRun,
      session: {
        ...activeRun.session,
        items: [
          {
            ...activeRun.session.items[0]!,
            completedAt: null,
            setExecutions: [],
          },
        ],
      },
    };
    const reviseSet = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          action: "correct",
          changedAt: "2026-08-14T03:34:00.000+00:00",
          completedSetCount: 1,
          exerciseCompleted: false,
          revision: 2,
          setExecutionId: performedSet.setExecutionId,
          setNumber: 1,
          totalSets: 2,
          wasChanged: true,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          action: "undo",
          changedAt: "2026-08-14T03:35:00.000+00:00",
          completedSetCount: 0,
          exerciseCompleted: false,
          revision: null,
          setExecutionId: performedSet.setExecutionId,
          setNumber: 1,
          totalSets: 2,
          wasChanged: true,
        },
      });
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: state(activeRun) })
        .mockResolvedValueOnce({ ok: true, value: state(correctedRun) })
        .mockResolvedValueOnce({ ok: true, value: state(undoneRun) }),
      pause: vi.fn(),
      reviseSet,
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);

    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    await openSetAdjustment(user);
    expect(
      screen.getByRole("dialog", { name: "Escolha uma série" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const weight = within(screen.getByRole("dialog")).getByRole("spinbutton", {
      name: /Carga/,
    });
    await user.clear(weight);
    await user.type(weight, "42");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(reviseSet).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          action: "correct",
          actualWeightKg: 42,
          expectedRevision: 1,
        }),
      ),
    );
    await openSetAdjustment(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      screen.getByRole("button", { name: "Desfazer esta série" }),
    );

    await waitFor(() =>
      expect(reviseSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: "undo",
          expectedRevision: 2,
        }),
      ),
    );
    expect(await screen.findByText("1 de 2")).toBeTruthy();
  });

  it("lets the user choose an older set without offering an unsafe undo", async () => {
    const user = userEvent.setup();
    const firstSet = {
      actualDistanceMeters: null,
      actualDurationSeconds: null,
      actualReps: 10,
      actualWeightKg: 40,
      completedAt: "2026-08-14T03:32:00.000+00:00",
      plannedDistanceMeters: null,
      plannedDurationSeconds: null,
      plannedRepsMax: 12,
      plannedRepsMin: 8,
      plannedWeightKg: 40,
      revision: 1,
      setExecutionId: "76000000-0000-4000-8000-000000000006",
      setNumber: 1,
      updatedAt: "2026-08-14T03:32:00.000+00:00",
    };
    const secondSet = {
      ...firstSet,
      actualReps: 11,
      actualWeightKg: 42.5,
      completedAt: "2026-08-14T03:34:00.000+00:00",
      plannedWeightKg: 42.5,
      setExecutionId: "76000000-0000-4000-8000-000000000007",
      setNumber: 2,
      updatedAt: "2026-08-14T03:34:00.000+00:00",
    };
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: {
        ...plannedSession,
        items: [
          {
            ...plannedSession.items[0]!,
            setExecutions: [firstSet, secondSet],
            sets: 3,
            startedAt: "2026-08-14T03:31:00.000+00:00",
          },
        ],
      },
      startedAt: "2026-08-14T03:30:00.000+00:00",
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));
    await openActiveExercise(user);

    await openSetAdjustment(user);
    const firstSetOption = screen.getByRole("radio", { name: /Série 1/ });
    const secondSetOption = screen.getByRole("radio", { name: /Série 2/ });
    expect((secondSetOption as HTMLInputElement).checked).toBe(true);

    await user.click(firstSetOption);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("dialog", { name: "Série 1" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Desfazer esta série" }),
    ).toBeNull();

    await user.click(
      within(screen.getByRole("dialog", { name: "Série 1" })).getByRole(
        "button",
        { name: "Voltar" },
      ),
    );
    await user.click(screen.getByRole("radio", { name: /Série 2/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("button", { name: "Desfazer esta série" }),
    ).toBeTruthy();
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
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway, navigate }));

    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(
      screen.getByRole("dialog", { name: "O que fazer com este treino?" }),
    ).toBeTruthy();
    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(gateway.pause).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pausar treino" }));

    expect(gateway.pause).toHaveBeenCalledWith(activeRun.runId);
    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/treinos/");
  });

  it("discards the active execution and immediately restarts the same training", async () => {
    const user = userEvent.setup();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const restartedRun: ActiveTrainingRun = {
      ...activeRun,
      runId: "78000000-0000-4000-8000-000000000008",
      startedAt: "2026-08-14T03:40:00.000+00:00",
    };
    const cancel = vi.fn().mockResolvedValue({
      ok: true,
      value: { runId: activeRun.runId, wasCancelled: true },
    });
    const start = vi.fn().mockResolvedValue({ ok: true, value: restartedRun });
    const gateway: TrainingSessionGateway = {
      cancel,
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause: vi.fn(),
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start,
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    await user.click(screen.getByRole("button", { name: "Recomeçar do zero" }));

    expect(cancel).toHaveBeenCalledWith(activeRun.runId);
    expect(start).toHaveBeenCalledWith(plannedSession.sessionId);
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      start.mock.invocationCallOrder[0]!,
    );
    expect(screen.getByRole("button", { name: "Voltar" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels the active execution without starting a replacement", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const activeRun: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: "75000000-0000-4000-8000-000000000005",
      session: plannedSession,
      startedAt: "2026-08-14T03:30:00.123456+00:00",
    };
    const cancel = vi.fn().mockResolvedValue({
      ok: true,
      value: { runId: activeRun.runId, wasCancelled: true },
    });
    const start = vi.fn();
    const pause = vi.fn();
    const gateway: TrainingSessionGateway = {
      cancel,
      completeExercise: vi.fn(),
      completeSet: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({ ok: true, value: state(activeRun) }),
      pause,
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start,
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway, navigate }));

    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar treino" }));

    expect(cancel).toHaveBeenCalledWith(activeRun.runId);
    expect(start).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/treinos/");
  });

  it("uses duration for a circuit exercise without rendering null repetitions", async () => {
    const user = userEvent.setup();
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
          previousSetReferences: [],
          repsMax: null,
          repsMin: null,
          setProgressionKg: null,
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
      reviseSet: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(ActiveTrainingScreen, { gateway }));

    await openActiveExercise(user, "Prancha lateral");

    const duration = await screen.findByRole("textbox", {
      name: "Tempo",
    });
    expect(duration.getAttribute("value")).toBe("00:00:30");
    expect(screen.queryByText(/null/i)).toBeNull();
    expect(screen.queryByText("Planejado")).toBeNull();
  });
});
