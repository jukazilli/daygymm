import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PracticalTrainingState,
  QueuedTrainingOperation,
  ReplayableTrainingSessionGateway,
  TrainingSessionLocalStore,
} from "@daygym/contracts";

import { TrainingSessionLocalFirstRuntime } from "./local-first-training-session-gateway";

const ownerId = "60000000-0000-4000-8000-000000000001";
const runId = "60000000-0000-4000-8000-000000000002";
const itemId = "60000000-0000-4000-8000-000000000003";
const sessionId = "60000000-0000-4000-8000-000000000004";
const canonicalSetId = "60000000-0000-4000-8000-000000000008";

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

function idleState() {
  const state = activeState();
  return { ...state, activeRun: null };
}

const setInput = {
  actualDistanceMeters: null,
  actualDurationSeconds: null,
  actualReps: 10,
  actualWeightKg: 40,
  itemId,
  runId,
  setNumber: 1,
};

class MemoryTrainingSessionStore implements TrainingSessionLocalStore {
  readonly operations = new Map<string, QueuedTrainingOperation>();
  readonly snapshots = new Map<string, PracticalTrainingState>();

  async readSnapshot(owner: string) {
    return structuredClone(this.snapshots.get(owner) ?? null);
  }

  async saveSnapshot(owner: string, state: PracticalTrainingState) {
    this.snapshots.set(owner, structuredClone(state));
  }

  async listOperations(owner: string) {
    void owner;
    return [...this.operations.values()]
      .map((operation) => structuredClone(operation))
      .sort((left, right) => left.sequence - right.sequence);
  }

  async enqueueOperation(
    owner: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ) {
    this.snapshots.set(owner, structuredClone(state));
    this.operations.set(operation.operationId, structuredClone(operation));
  }

  async confirmOperation(
    owner: string,
    operationId: string,
    state: PracticalTrainingState,
    replacements: readonly QueuedTrainingOperation[] = [],
  ) {
    this.snapshots.set(owner, structuredClone(state));
    this.operations.delete(operationId);
    for (const replacement of replacements) {
      this.operations.set(
        replacement.operationId,
        structuredClone(replacement),
      );
    }
  }

  async replaceWithCanonical(owner: string, state: PracticalTrainingState) {
    this.snapshots.set(owner, structuredClone(state));
    this.operations.clear();
  }

  async markConflict(_owner: string, operationId: string) {
    const operation = this.operations.get(operationId);
    if (operation) {
      this.operations.set(operationId, { ...operation, status: "conflict" });
    }
  }

  async markPending(_owner: string, operationId: string) {
    const operation = this.operations.get(operationId);
    if (operation) {
      this.operations.set(operationId, {
        ...operation,
        retryAt: new Date(0).toISOString(),
        status: "pending",
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
      this.operations.set(operationId, { ...operation, attempts, retryAt });
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
  overrides: Partial<ReplayableTrainingSessionGateway> = {},
): ReplayableTrainingSessionGateway {
  const failure = vi.fn().mockResolvedValue({
    ok: false,
    reason: "unexpected",
  });
  return {
    cancel: failure,
    cancelOnce: failure,
    completeExercise: failure,
    completeSet: failure,
    finish: failure,
    finishAt: failure,
    load: failure,
    pause: failure,
    pauseAt: failure,
    resume: failure,
    resumeAt: failure,
    reviseSet: failure,
    start: failure,
    startExercise: failure,
    startWithIdentity: failure,
    ...overrides,
  } as ReplayableTrainingSessionGateway;
}

function localGateway(
  store: MemoryTrainingSessionStore,
  connectivity: MutableConnectivity,
  remote: ReplayableTrainingSessionGateway,
  options: { now?: () => Date; ownerId?: () => Promise<string | null> } = {},
) {
  return new TrainingSessionLocalFirstRuntime({
    connectivity,
    now: options.now ?? (() => new Date("2026-08-15T20:02:00.000Z")),
    ownerId: options.ownerId ?? (async () => ownerId),
    random: () => 0.5,
    remote,
    store,
    uuid: () => "60000000-0000-4000-8000-000000000007",
  });
}

function successfulCompletion(wasCreated = true) {
  return {
    ok: true as const,
    value: {
      completedAt: "2026-08-15T20:02:01.000Z",
      completedSetCount: 1,
      exerciseCompleted: false,
      setExecutionId: canonicalSetId,
      setNumber: 1,
      totalSets: 2,
      wasCreated,
    },
  };
}

describe("TrainingSessionLocalFirstRuntime", () => {
  let store: MemoryTrainingSessionStore;

  beforeEach(async () => {
    store = new MemoryTrainingSessionStore();
    await store.saveSnapshot(ownerId, activeState());
  });

  it("restores locally confirmed sets after the app is reopened offline", async () => {
    const connectivity = new MutableConnectivity(false);
    const remote = remoteGateway();
    const first = localGateway(store, connectivity, remote);
    await first.completeSet(setInput);
    await first.completeSet({ ...setInput, setNumber: 2 });

    const reopened = localGateway(store, connectivity, remote);
    const restored = await reopened.load();

    expect(
      restored.ok && restored.value.activeRun?.session.items[0],
    ).toMatchObject({
      setExecutions: [
        expect.objectContaining({ setNumber: 1 }),
        expect.objectContaining({ setNumber: 2 }),
      ],
    });
    expect(restored.ok && restored.value.activeRest).toBeNull();
    expect(reopened.getSyncState()).toMatchObject({
      pendingCount: 2,
      status: "offline",
    });
  });

  it("restores an absolute rest deadline after reopening and removes it when dismissed", async () => {
    const connectivity = new MutableConnectivity(false);
    const remote = remoteGateway();
    const first = localGateway(store, connectivity, remote, {
      now: () => new Date("2026-08-15T20:02:00.000Z"),
    });

    await first.completeSet(setInput);

    const reopened = localGateway(store, connectivity, remote, {
      now: () => new Date("2026-08-15T20:03:00.000Z"),
    });
    const restored = await reopened.load();

    expect(restored).toMatchObject({
      ok: true,
      value: {
        activeRest: {
          durationSeconds: 90,
          endsAt: "2026-08-15T20:03:30.000Z",
          nextItemId: itemId,
          runId,
          setNumber: 1,
          sourceItemId: itemId,
        },
      },
    });

    await reopened.dismissRest(runId);
    const afterDismiss = await reopened.load();
    expect(afterDismiss.ok && afterDismiss.value.activeRest).toBeNull();
  });

  it("extends the absolute rest deadline and persists the adjustment", async () => {
    const connectivity = new MutableConnectivity(false);
    const remote = remoteGateway();
    const gateway = localGateway(store, connectivity, remote, {
      now: () => new Date("2026-08-15T20:02:00.000Z"),
    });
    await gateway.completeSet(setInput);

    const adjusted = await gateway.adjustRest(runId, 30);

    expect(adjusted).toMatchObject({
      ok: true,
      value: {
        activeRest: {
          durationSeconds: 120,
          endsAt: "2026-08-15T20:04:00.000Z",
        },
      },
    });
    expect(store.snapshots.get(ownerId)?.activeRest).toMatchObject({
      durationSeconds: 120,
      endsAt: "2026-08-15T20:04:00.000Z",
    });
    expect(remote.completeSet).not.toHaveBeenCalled();
  });

  it("caps an adjusted rest at thirty minutes", async () => {
    const snapshot = activeState();
    snapshot.activeRest = {
      durationSeconds: 1_790,
      endsAt: "2026-08-15T20:31:50.000Z",
      nextItemId: itemId,
      runId,
      setNumber: 1,
      sourceItemId: itemId,
    };
    snapshot.activeRun!.session.items[0]!.setExecutions = [
      {
        actualDistanceMeters: null,
        actualDurationSeconds: null,
        actualReps: 10,
        actualWeightKg: 40,
        completedAt: "2026-08-15T20:02:00.000Z",
        plannedDistanceMeters: null,
        plannedDurationSeconds: null,
        plannedRepsMax: 12,
        plannedRepsMin: 8,
        plannedWeightKg: 40,
        revision: 1,
        setExecutionId: canonicalSetId,
        setNumber: 1,
        updatedAt: "2026-08-15T20:02:00.000Z",
      },
    ];
    await store.saveSnapshot(ownerId, snapshot);
    const gateway = localGateway(
      store,
      new MutableConnectivity(false),
      remoteGateway(),
      { now: () => new Date("2026-08-15T20:02:00.000Z") },
    );

    const adjusted = await gateway.adjustRest(runId, 30);

    expect(adjusted).toMatchObject({
      ok: true,
      value: {
        activeRest: {
          durationSeconds: 1_800,
          endsAt: "2026-08-15T20:32:00.000Z",
        },
      },
    });
  });

  it("drops a finished rest period when the app reopens", async () => {
    const connectivity = new MutableConnectivity(false);
    const remote = remoteGateway();
    const first = localGateway(store, connectivity, remote, {
      now: () => new Date("2026-08-15T20:02:00.000Z"),
    });
    await first.completeSet(setInput);

    const reopened = localGateway(store, connectivity, remote, {
      now: () => new Date("2026-08-15T20:04:00.000Z"),
    });
    const restored = await reopened.load();

    expect(restored.ok && restored.value.activeRest).toBeNull();
  });

  it("keeps an active local rest deadline when refreshing canonical data", async () => {
    const offline = new MutableConnectivity(false);
    const first = localGateway(store, offline, remoteGateway(), {
      now: () => new Date("2026-08-15T20:02:00.000Z"),
    });
    await first.completeSet(setInput);
    store.operations.clear();

    const canonical = structuredClone(store.snapshots.get(ownerId)!);
    delete canonical.activeRest;
    const online = new MutableConnectivity(true);
    const reopened = localGateway(
      store,
      online,
      remoteGateway({
        load: vi.fn().mockResolvedValue({ ok: true, value: canonical }),
      }),
      { now: () => new Date("2026-08-15T20:03:00.000Z") },
    );

    const refreshed = await reopened.load();

    expect(refreshed).toMatchObject({
      ok: true,
      value: { activeRest: { endsAt: "2026-08-15T20:03:30.000Z" } },
    });
    expect(store.snapshots.get(ownerId)?.activeRest).toMatchObject({
      endsAt: "2026-08-15T20:03:30.000Z",
    });
  });

  it("selects a saved session from the weekly agenda while offline", async () => {
    const snapshot = idleState();
    const selectedSession = {
      ...snapshot.sessions[0]!,
      name: "Treino B",
      sessionId: "60000000-0000-4000-8000-000000000009",
      weekday: 2,
    };
    snapshot.nextSession = null;
    snapshot.sessions = [...snapshot.sessions, selectedSession];
    await store.saveSnapshot(ownerId, snapshot);
    const remote = remoteGateway();
    const gateway = localGateway(store, new MutableConnectivity(false), remote);

    const selected = await gateway.load(selectedSession.sessionId);

    expect(selected).toMatchObject({
      ok: true,
      value: { nextSession: { sessionId: selectedSession.sessionId } },
    });
    expect(remote.load).not.toHaveBeenCalled();
  });

  it("replays once and replaces the optimistic set identity with the canonical state", async () => {
    const connectivity = new MutableConnectivity(false);
    const completeSet = vi.fn().mockResolvedValue(successfulCompletion());
    const canonical = activeState();
    canonical.activeRun!.session.items[0]!.setExecutions = [];
    const remote = remoteGateway({
      completeSet,
      load: vi.fn().mockResolvedValue({ ok: true, value: canonical }),
    });
    const gateway = localGateway(store, connectivity, remote);
    await gateway.completeSet(setInput);

    connectivity.setOnline(true);
    await gateway.synchronize();
    await gateway.synchronize();

    expect(completeSet).toHaveBeenCalledOnce();
    expect(store.operations.size).toBe(0);
    expect(gateway.getSyncState().status).toBe("synced");
  });

  it("finishes partially offline and replays the explicit outcome", async () => {
    const connectivity = new MutableConnectivity(false);
    const finishAt = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        completedAt: "2026-08-15T20:02:00.000Z",
        completedSetCount: 1,
        completionStatus: "partial",
        durationSeconds: 120,
        plannedSetCount: 2,
        sessionId: runId,
        wasCreated: true,
      },
    });
    const remote = remoteGateway({
      completeSet: vi.fn().mockResolvedValue(successfulCompletion()),
      finishAt,
      load: vi.fn().mockResolvedValue({ ok: true, value: idleState() }),
    });
    const gateway = localGateway(store, connectivity, remote);
    await gateway.completeSet(setInput);

    const finished = await gateway.finish(runId, "partial");
    expect(finished).toMatchObject({
      ok: true,
      value: {
        completedSetCount: 1,
        completionStatus: "partial",
        plannedSetCount: 2,
      },
    });
    expect([...store.operations.values()].at(-1)).toMatchObject({
      input: { completionStatus: "partial", runId },
      kind: "finish-session",
    });

    connectivity.setOnline(true);
    await gateway.synchronize();

    expect(finishAt).toHaveBeenCalledWith(
      runId,
      "2026-08-15T20:02:00.000Z",
      "partial",
    );
  });

  it("replays start, exercise, pause, resume and cancel in causal order", async () => {
    await store.saveSnapshot(ownerId, idleState());
    const connectivity = new MutableConnectivity(false);
    const calls: string[] = [];
    const remote = remoteGateway({
      cancelOnce: vi.fn(async () => {
        calls.push("cancel");
        return {
          ok: true as const,
          value: {
            runId: "60000000-0000-4000-8000-000000000007",
            wasCancelled: true,
          },
        };
      }),
      load: vi.fn().mockResolvedValue({ ok: true, value: idleState() }),
      pauseAt: vi.fn(async () => {
        calls.push("pause");
        return {
          ok: true as const,
          value: {
            pausedAt: "2026-08-15T20:02:00.000Z",
            pausedDurationSeconds: 0,
            runId: "60000000-0000-4000-8000-000000000007",
            wasChanged: true,
          },
        };
      }),
      resumeAt: vi.fn(async () => {
        calls.push("resume");
        return {
          ok: true as const,
          value: {
            pausedAt: null,
            pausedDurationSeconds: 0,
            runId: "60000000-0000-4000-8000-000000000007",
            wasChanged: true,
          },
        };
      }),
      startExercise: vi.fn(async () => {
        calls.push("exercise");
        return {
          ok: true as const,
          value: {
            nextSetNumber: 1,
            startedAt: "2026-08-15T20:02:00.000Z",
            totalSets: 2,
            wasCreated: true,
          },
        };
      }),
      startWithIdentity: vi.fn(async (input) => {
        calls.push("start");
        const state = idleState();
        return {
          ok: true as const,
          value: {
            pausedAt: null,
            pausedDurationSeconds: 0,
            runId: input.runId,
            session: state.nextSession!,
            startedAt: input.startedAt,
          },
        };
      }),
    });
    const gateway = localGateway(store, connectivity, remote);
    const started = await gateway.start(sessionId);
    expect(started.ok).toBe(true);
    const localRunId = started.ok ? started.value.runId : "";
    await gateway.startExercise(localRunId, itemId);
    await gateway.pause(localRunId);
    await gateway.resume(localRunId);
    await gateway.cancel(localRunId);

    connectivity.setOnline(true);
    await gateway.synchronize();

    expect(calls).toEqual(["start", "exercise", "pause", "resume", "cancel"]);
    expect(store.operations.size).toBe(0);
  });

  it("rewrites a queued revision to the canonical set id before replay", async () => {
    const connectivity = new MutableConnectivity(false);
    const reviseSet = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        action: "correct",
        changedAt: "2026-08-15T20:03:00.000Z",
        completedSetCount: 1,
        exerciseCompleted: false,
        revision: 2,
        setExecutionId: canonicalSetId,
        setNumber: 1,
        totalSets: 2,
        wasChanged: true,
      },
    });
    const remote = remoteGateway({
      completeSet: vi.fn().mockResolvedValue(successfulCompletion()),
      load: vi.fn().mockResolvedValue({ ok: true, value: activeState() }),
      reviseSet,
    });
    const gateway = localGateway(store, connectivity, remote);
    const completed = await gateway.completeSet(setInput);
    const localSetId = completed.ok ? completed.value.setExecutionId : "";
    await gateway.reviseSet({
      ...setInput,
      action: "correct",
      expectedRevision: 1,
      setExecutionId: localSetId,
    });

    connectivity.setOnline(true);
    await gateway.synchronize();

    expect(reviseSet).toHaveBeenCalledWith(
      expect.objectContaining({ setExecutionId: canonicalSetId }),
    );
  });

  it("keeps conflicts until the user explicitly chooses the server state", async () => {
    const connectivity = new MutableConnectivity(false);
    const canonical = idleState();
    const remote = remoteGateway({
      completeSet: vi.fn().mockResolvedValue({ ok: false, reason: "conflict" }),
      load: vi.fn().mockResolvedValue({ ok: true, value: canonical }),
    });
    const gateway = localGateway(store, connectivity, remote);
    await gateway.completeSet(setInput);
    connectivity.setOnline(true);
    await gateway.synchronize();

    expect(gateway.getSyncState().status).toBe("conflict");
    expect(store.operations.size).toBe(1);

    const resolved = await gateway.resolveConflict("use-server");
    expect(resolved.ok).toBe(true);
    expect(store.operations.size).toBe(0);
    expect(store.snapshots.get(ownerId)).toEqual(canonical);
  });

  it("retains pending work across logout and restores it for the same owner", async () => {
    const connectivity = new MutableConnectivity(false);
    let signedInOwner: string | null = ownerId;
    const remote = remoteGateway({
      load: vi.fn().mockResolvedValue({ ok: false, reason: "session" }),
    });
    const gateway = localGateway(store, connectivity, remote, {
      ownerId: async () => signedInOwner,
    });
    await gateway.completeSet(setInput);
    signedInOwner = null;
    await gateway.load();
    expect(store.operations.size).toBe(1);

    signedInOwner = ownerId;
    const restored = await gateway.load();
    expect(
      restored.ok && restored.value.activeRun?.session.items[0]?.setExecutions,
    ).toHaveLength(1);
  });
});
