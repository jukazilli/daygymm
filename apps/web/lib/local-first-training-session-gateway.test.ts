import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PracticalTrainingState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { WebLocalFirstTrainingSessionGateway } from "./local-first-training-session-gateway";
import type {
  QueuedTrainingSetCompletion,
  TrainingSessionLocalStore,
} from "./training-session-local-store";

const ownerId = "60000000-0000-4000-8000-000000000001";
const runId = "60000000-0000-4000-8000-000000000002";
const itemId = "60000000-0000-4000-8000-000000000003";
const sessionId = "60000000-0000-4000-8000-000000000004";

function activeState(): PracticalTrainingState {
  const session = {
    dayOrder: 1,
    items: [
      {
        circuitGroup: null,
        completedAt: null,
        distanceMeters: null,
        durationSeconds: null,
        exerciseName: "Agachamento",
        itemId,
        modality: "strength" as const,
        notes: null,
        order: 1,
        plannedWeightKg: 40,
        previousSetReferences: [],
        repsMax: 12,
        repsMin: 8,
        restSeconds: 90,
        setProgressionKg: 2.5,
        sets: 2,
        setExecutions: [],
        startedAt: "2026-08-15T20:01:00.000Z",
      },
    ],
    name: "Treino A",
    sessionId,
    weekday: 1,
  };
  return {
    activeRun: {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId,
      session,
      startedAt: "2026-08-15T20:00:00.000Z",
    },
    lastCompletedAt: null,
    nextSession: session,
    plan: {
      itemCount: 1,
      name: "Plano local-first",
      planId: "60000000-0000-4000-8000-000000000005",
      sessionCount: 1,
      version: 1,
      versionId: "60000000-0000-4000-8000-000000000006",
      wasCreated: false,
    },
    sessions: [session],
  };
}

const input = {
  actualDistanceMeters: null,
  actualDurationSeconds: null,
  actualReps: 10,
  actualWeightKg: 40,
  itemId,
  runId,
  setNumber: 1,
};

class MemoryTrainingSessionStore implements TrainingSessionLocalStore {
  readonly operations = new Map<string, QueuedTrainingSetCompletion>();
  readonly snapshots = new Map<string, PracticalTrainingState>();

  async readSnapshot(owner: string) {
    return structuredClone(this.snapshots.get(owner) ?? null);
  }

  async saveSnapshot(owner: string, state: PracticalTrainingState) {
    this.snapshots.set(owner, structuredClone(state));
  }

  async listCompletions(owner: string) {
    void owner;
    return [...this.operations.values()]
      .map((operation) => structuredClone(operation))
      .sort((left, right) => left.sequence - right.sequence);
  }

  async enqueueCompletion(
    owner: string,
    operation: QueuedTrainingSetCompletion,
    state: PracticalTrainingState,
  ) {
    this.snapshots.set(owner, structuredClone(state));
    this.operations.set(operation.operationId, structuredClone(operation));
  }

  async confirmCompletion(
    owner: string,
    operationId: string,
    state: PracticalTrainingState,
  ) {
    this.snapshots.set(owner, structuredClone(state));
    this.operations.delete(operationId);
  }

  async markConflict(_owner: string, operationId: string) {
    const operation = this.operations.get(operationId);
    if (operation) {
      this.operations.set(operationId, {
        ...operation,
        status: "conflict",
      });
    }
  }

  async markRetry(
    _owner: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ) {
    const operation = this.operations.get(operationId);
    if (operation) {
      this.operations.set(operationId, {
        ...operation,
        attempts,
        retryAt,
      });
    }
  }
}

class MutableConnectivity {
  constructor(private online: boolean) {}

  isOnline() {
    return this.online;
  }

  subscribe() {
    return () => undefined;
  }

  setOnline(online: boolean) {
    this.online = online;
  }
}

function remoteGateway(
  completeSet: TrainingSessionGateway["completeSet"] = vi.fn(),
): TrainingSessionGateway {
  return {
    cancel: vi.fn(),
    completeExercise: vi.fn(),
    completeSet,
    finish: vi.fn(),
    load: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reviseSet: vi.fn(),
    start: vi.fn(),
    startExercise: vi.fn(),
  };
}

function localGateway(
  store: MemoryTrainingSessionStore,
  connectivity: MutableConnectivity,
  remote: TrainingSessionGateway,
) {
  return new WebLocalFirstTrainingSessionGateway({
    connectivity,
    now: () => new Date("2026-08-15T20:02:00.000Z"),
    ownerId: async () => ownerId,
    random: () => 0.5,
    remote,
    store,
    uuid: () => "60000000-0000-4000-8000-000000000007",
  });
}

describe("WebLocalFirstTrainingSessionGateway", () => {
  let store: MemoryTrainingSessionStore;

  beforeEach(async () => {
    store = new MemoryTrainingSessionStore();
    await store.saveSnapshot(ownerId, activeState());
  });

  it("restores a locally confirmed set after the app is reopened offline", async () => {
    const connectivity = new MutableConnectivity(false);
    const remote = remoteGateway();
    const firstInstance = localGateway(store, connectivity, remote);

    const completed = await firstInstance.completeSet(input);
    expect(completed).toMatchObject({
      ok: true,
      value: { setNumber: 1, wasCreated: true },
    });
    await firstInstance.completeSet({
      ...input,
      actualReps: 9,
      actualWeightKg: 42.5,
      setNumber: 2,
    });
    expect(firstInstance.getSyncState()).toMatchObject({
      pendingCount: 2,
      status: "offline",
    });

    const reopened = localGateway(store, connectivity, remote);
    const restored = await reopened.load();
    expect(
      restored.ok && restored.value.activeRun?.session.items[0],
    ).toMatchObject({
      setExecutions: [
        expect.objectContaining({
          actualReps: 10,
          actualWeightKg: 40,
          setNumber: 1,
        }),
        expect.objectContaining({
          actualReps: 9,
          actualWeightKg: 42.5,
          setNumber: 2,
        }),
      ],
    });
    expect(remote.completeSet).not.toHaveBeenCalled();
  });

  it("replays once after reconnection and replaces the local id with the canonical id", async () => {
    const connectivity = new MutableConnectivity(false);
    const completeSet = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        completedAt: "2026-08-15T20:02:01.000Z",
        completedSetCount: 1,
        exerciseCompleted: false,
        setExecutionId: "60000000-0000-4000-8000-000000000008",
        setNumber: 1,
        totalSets: 2,
        wasCreated: true,
      },
    });
    const gateway = localGateway(
      store,
      connectivity,
      remoteGateway(completeSet),
    );
    await gateway.completeSet(input);

    connectivity.setOnline(true);
    await gateway.synchronize();
    await gateway.synchronize();

    expect(completeSet).toHaveBeenCalledOnce();
    expect(store.operations.size).toBe(0);
    expect(
      store.snapshots.get(ownerId)?.activeRun?.session.items[0],
    ).toMatchObject({
      setExecutions: [
        expect.objectContaining({
          setExecutionId: "60000000-0000-4000-8000-000000000008",
        }),
      ],
    });
    expect(gateway.getSyncState()).toMatchObject({
      pendingCount: 0,
      status: "synced",
    });
  });

  it("keeps a transient failure queued and succeeds on a manual retry", async () => {
    const connectivity = new MutableConnectivity(false);
    const completeSet = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "unexpected" })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          completedAt: "2026-08-15T20:02:01.000Z",
          completedSetCount: 1,
          exerciseCompleted: false,
          setExecutionId: "60000000-0000-4000-8000-000000000008",
          setNumber: 1,
          totalSets: 2,
          wasCreated: false,
        },
      });
    const gateway = localGateway(
      store,
      connectivity,
      remoteGateway(completeSet),
    );
    await gateway.completeSet(input);
    connectivity.setOnline(true);

    await gateway.synchronize();
    expect(store.operations.size).toBe(1);
    expect(gateway.getSyncState().status).toBe("pending");

    await gateway.synchronize();
    expect(completeSet).toHaveBeenCalledTimes(2);
    expect(store.operations.size).toBe(0);
    expect(gateway.getSyncState().status).toBe("synced");
  });

  it("preserves a rejected operation as an explicit conflict", async () => {
    const connectivity = new MutableConnectivity(false);
    const gateway = localGateway(
      store,
      connectivity,
      remoteGateway(
        vi.fn().mockResolvedValue({ ok: false, reason: "conflict" }),
      ),
    );
    await gateway.completeSet(input);
    connectivity.setOnline(true);

    await gateway.synchronize();

    expect(store.operations.size).toBe(1);
    expect([...store.operations.values()][0]?.status).toBe("conflict");
    expect(gateway.getSyncState()).toMatchObject({
      pendingCount: 1,
      status: "conflict",
    });
  });

  it("never labels a remote-only fallback as locally persisted", async () => {
    const connectivity = new MutableConnectivity(true);
    store.enqueueCompletion = vi.fn().mockRejectedValue(new Error("quota"));
    const completeSet = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        completedAt: "2026-08-15T20:02:01.000Z",
        completedSetCount: 1,
        exerciseCompleted: false,
        setExecutionId: "60000000-0000-4000-8000-000000000008",
        setNumber: 1,
        totalSets: 2,
        wasCreated: true,
      },
    });
    const gateway = localGateway(
      store,
      connectivity,
      remoteGateway(completeSet),
    );

    await expect(gateway.completeSet(input)).resolves.toMatchObject({
      ok: true,
    });
    expect(completeSet).toHaveBeenCalledOnce();
    expect(gateway.getSyncState().status).toBe("conflict");
  });
});
