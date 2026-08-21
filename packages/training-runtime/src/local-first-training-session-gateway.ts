import {
  setCompletionInputSchema,
  setRevisionInputSchema,
  type ActiveTrainingRun,
  type CompletedTrainingSession,
  type LocalFirstTrainingSessionGateway,
  type PracticalTrainingState,
  type QueuedTrainingOperation,
  type ReplayableTrainingSessionGateway,
  type SetCompletion,
  type SetRevision,
  type TrainingPauseState,
  type TrainingSessionConflictResolution,
  type TrainingSessionGateway,
  type TrainingSessionLocalStore,
  type TrainingSessionResult,
  type TrainingSessionSyncState,
} from "@daygym/contracts";

import {
  applyCancelledTraining,
  applyCompletedTrainingSetWithRest,
  extendActiveTrainingRest,
  applyFinishedTraining,
  applyRevisedTrainingSet,
  applyStartedExercise,
  applyStartedTraining,
  applyTrainingPauseState,
} from "./training-session-state";

export interface TrainingConnectivity {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type TrainingOwnerIdProvider = () => Promise<string | null>;

export interface LocalFirstTrainingSessionDependencies {
  readonly connectivity: TrainingConnectivity;
  readonly now?: () => Date;
  readonly ownerId: TrainingOwnerIdProvider;
  readonly random?: () => number;
  readonly remote: ReplayableTrainingSessionGateway;
  readonly store: TrainingSessionLocalStore;
  readonly uuid: () => string;
}

function completionOperationId(input: {
  readonly itemId: string;
  readonly runId: string;
  readonly setNumber: number;
}) {
  return `training-set:${input.runId}:${input.itemId}:${input.setNumber}`;
}

function revisionOperationId(
  input: ReturnType<typeof setRevisionInputSchema.parse>,
) {
  const values =
    input.action === "correct"
      ? [
          input.actualReps,
          input.actualWeightKg,
          input.actualDurationSeconds,
          input.actualDistanceMeters,
        ]
      : [];
  return [
    "training-revise",
    input.action,
    input.runId,
    input.itemId,
    input.setNumber,
    input.expectedRevision,
    ...values.map((value) => value ?? "n"),
  ].join(":");
}

function retryDelayMilliseconds(attempts: number, random: () => number) {
  const boundedBase = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
  return Math.round(boundedBase * (0.75 + random() * 0.5));
}

function localCompletion(
  state: PracticalTrainingState,
  input: ReturnType<typeof setCompletionInputSchema.parse>,
  completedAt: string,
  setExecutionId: string,
): TrainingSessionResult<SetCompletion> {
  const exercise = state.activeRun?.session.items.find(
    (candidate) => candidate.itemId === input.itemId,
  );
  if (
    !state.activeRun ||
    state.activeRun.runId !== input.runId ||
    !exercise ||
    input.setNumber > exercise.sets
  ) {
    return { ok: false, reason: "invalid" };
  }
  const existing = exercise.setExecutions.find(
    (candidate) => candidate.setNumber === input.setNumber,
  );
  const completedSetCount = existing
    ? exercise.setExecutions.length
    : exercise.setExecutions.length + 1;
  return {
    ok: true,
    value: {
      completedAt: existing?.completedAt ?? completedAt,
      completedSetCount,
      exerciseCompleted: completedSetCount >= exercise.sets,
      setExecutionId: existing?.setExecutionId ?? setExecutionId,
      setNumber: input.setNumber,
      totalSets: exercise.sets,
      wasCreated: !existing,
    },
  };
}

function localRevision(
  state: PracticalTrainingState,
  input: ReturnType<typeof setRevisionInputSchema.parse>,
  changedAt: string,
): TrainingSessionResult<SetRevision> {
  const exercise = state.activeRun?.session.items.find(
    (candidate) => candidate.itemId === input.itemId,
  );
  const set = exercise?.setExecutions.find(
    (candidate) => candidate.setNumber === input.setNumber,
  );
  if (
    !state.activeRun ||
    state.activeRun.runId !== input.runId ||
    !exercise ||
    !set ||
    set.setExecutionId !== input.setExecutionId ||
    set.revision !== input.expectedRevision
  ) {
    return { ok: false, reason: "conflict" };
  }
  if (
    input.action === "undo" &&
    exercise.setExecutions.at(-1)?.setNumber !== input.setNumber
  ) {
    return { ok: false, reason: "invalid" };
  }
  const completedSetCount =
    input.action === "undo"
      ? exercise.setExecutions.length - 1
      : exercise.setExecutions.length;
  return {
    ok: true,
    value: {
      action: input.action,
      changedAt,
      completedSetCount,
      exerciseCompleted: completedSetCount >= exercise.sets,
      revision: input.action === "correct" ? input.expectedRevision + 1 : null,
      setExecutionId: input.setExecutionId,
      setNumber: input.setNumber,
      totalSets: exercise.sets,
      wasChanged: true,
    },
  };
}

function selectLocalSession(
  state: PracticalTrainingState,
  preferredSessionId?: string,
) {
  if (state.activeRun || !preferredSessionId) {
    return state;
  }
  const selected = state.sessions.find(
    (session) => session.sessionId === preferredSessionId,
  );
  return selected ? { ...state, nextSession: selected } : state;
}

function activeRestIsValid(state: PracticalTrainingState, now: Date) {
  const rest = state.activeRest;
  const run = state.activeRun;
  if (
    !rest ||
    !run ||
    rest.runId !== run.runId ||
    new Date(rest.endsAt).getTime() <= now.getTime()
  ) {
    return false;
  }
  const source = run.session.items.find(
    (item) => item.itemId === rest.sourceItemId,
  );
  const next = run.session.items.find(
    (item) => item.itemId === rest.nextItemId,
  );
  return Boolean(
    source?.setExecutions.some(
      (execution) => execution.setNumber === rest.setNumber,
    ) &&
    next &&
    !next.completedAt,
  );
}

function withoutExpiredRest(state: PracticalTrainingState, now: Date) {
  return state.activeRest && !activeRestIsValid(state, now)
    ? { ...state, activeRest: null }
    : state;
}

function preserveActiveRest(
  local: PracticalTrainingState | null,
  canonical: PracticalTrainingState,
  now: Date,
) {
  if (!local?.activeRest) {
    return { ...canonical, activeRest: null };
  }
  const merged = { ...canonical, activeRest: local.activeRest };
  return activeRestIsValid(merged, now)
    ? merged
    : { ...canonical, activeRest: null };
}

export class TrainingSessionLocalFirstRuntime implements LocalFirstTrainingSessionGateway {
  private activeOwnerId: string | null = null;
  private connectivitySubscription: (() => void) | undefined;
  private readonly listeners = new Set<
    (state: TrainingSessionSyncState) => void
  >();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private sequenceWithinMillisecond = 0;
  private sequenceTimestamp = 0;
  private syncPromise: Promise<void> | undefined;
  private syncState: TrainingSessionSyncState;

  private readonly connectivity: TrainingConnectivity;
  private readonly now: () => Date;
  private readonly ownerIdProvider: TrainingOwnerIdProvider;
  private readonly random: () => number;
  private readonly remote: ReplayableTrainingSessionGateway;
  private readonly store: TrainingSessionLocalStore;
  private readonly uuid: () => string;

  constructor(dependencies: LocalFirstTrainingSessionDependencies) {
    this.connectivity = dependencies.connectivity;
    this.now = dependencies.now ?? (() => new Date());
    this.ownerIdProvider = dependencies.ownerId;
    this.random = dependencies.random ?? Math.random;
    this.remote = dependencies.remote;
    this.store = dependencies.store;
    this.uuid = dependencies.uuid;
    this.syncState = {
      lastSyncedAt: null,
      pendingCount: 0,
      status: this.connectivity.isOnline() ? "synced" : "offline",
    };
  }

  getSyncState() {
    return this.syncState;
  }

  subscribeSyncState(listener: (state: TrainingSessionSyncState) => void) {
    this.listeners.add(listener);
    listener(this.syncState);
    if (!this.connectivitySubscription) {
      this.connectivitySubscription = this.connectivity.subscribe((online) => {
        if (online) {
          void this.runSynchronization(false);
        } else {
          this.updateSyncState({ status: "offline" });
        }
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.connectivitySubscription?.();
        this.connectivitySubscription = undefined;
      }
    };
  }

  async load(preferredSessionId?: string) {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return this.remote.load(preferredSessionId);
    }
    try {
      const [storedSnapshot, operations] = await Promise.all([
        this.store.readSnapshot(ownerId),
        this.store.listOperations(ownerId),
      ]);
      const snapshot = storedSnapshot
        ? withoutExpiredRest(storedSnapshot, this.now())
        : null;
      if (snapshot && snapshot !== storedSnapshot) {
        await this.store.saveSnapshot(ownerId, snapshot);
      }
      this.reflectOperations(operations);
      if (operations.length > 0) {
        if (this.connectivity.isOnline()) {
          void this.runSynchronization(false);
        }
        if (snapshot) {
          return {
            ok: true,
            value: selectLocalSession(snapshot, preferredSessionId),
          } as const;
        }
      }
      if (!this.connectivity.isOnline() && snapshot) {
        this.updateSyncState({ status: "offline" });
        return {
          ok: true,
          value: selectLocalSession(snapshot, preferredSessionId),
        } as const;
      }
      const remote = await this.remote.load(preferredSessionId);
      if (remote.ok) {
        const merged = preserveActiveRest(snapshot, remote.value, this.now());
        await this.store.saveSnapshot(ownerId, merged);
        this.updateSyncState({
          lastSyncedAt: this.now().toISOString(),
          pendingCount: 0,
          status: this.connectivity.isOnline() ? "synced" : "offline",
        });
        return {
          ok: true,
          value: selectLocalSession(merged, preferredSessionId),
        } as const;
      }
      return snapshot
        ? ({
            ok: true,
            value: selectLocalSession(snapshot, preferredSessionId),
          } as const)
        : remote;
    } catch {
      this.blockLocalPersistence();
      return this.remote.load(preferredSessionId);
    }
  }

  async start(plannedSessionId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.start(plannedSessionId);
    }
    const { ownerId, snapshot } = context;
    if (snapshot.activeRun) {
      return { ok: true, value: snapshot.activeRun } as const;
    }
    const planned =
      snapshot.sessions.find(
        (session) => session.sessionId === plannedSessionId,
      ) ??
      (snapshot.nextSession?.sessionId === plannedSessionId
        ? snapshot.nextSession
        : null);
    if (!planned) {
      return { ok: false, reason: "invalid" } as const;
    }
    const startedAt = this.now().toISOString();
    const run: ActiveTrainingRun = {
      pausedAt: null,
      pausedDurationSeconds: 0,
      runId: this.uuid(),
      session: {
        ...planned,
        items: planned.items.map((item) => ({
          ...item,
          completedAt: null,
          setExecutions: [],
          startedAt: null,
        })),
      },
      startedAt,
    };
    const operation = this.operation("start-session", {
      plannedSessionId,
      runId: run.runId,
      startedAt,
    });
    if (
      !(await this.persist(
        ownerId,
        operation,
        applyStartedTraining(snapshot, run),
      ))
    ) {
      return this.remote.start(plannedSessionId);
    }
    return { ok: true, value: run } as const;
  }

  async startExercise(runId: string, itemId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.startExercise(runId, itemId);
    }
    const exercise = context.snapshot.activeRun?.session.items.find(
      (item) => item.itemId === itemId,
    );
    if (
      !exercise ||
      context.snapshot.activeRun?.runId !== runId ||
      exercise.completedAt
    ) {
      return { ok: false, reason: "invalid" } as const;
    }
    const startedAt = exercise.startedAt ?? this.now().toISOString();
    const result = {
      nextSetNumber: Math.min(exercise.sets, exercise.setExecutions.length + 1),
      startedAt,
      totalSets: exercise.sets,
      wasCreated: exercise.startedAt === null,
    };
    if (!result.wasCreated) {
      return { ok: true, value: result } as const;
    }
    const operation = this.operation("start-exercise", {
      itemId,
      runId,
      startedAt,
    });
    const next = applyStartedExercise(
      context.snapshot,
      runId,
      itemId,
      startedAt,
    );
    if (!(await this.persist(context.ownerId, operation, next))) {
      return this.remote.startExercise(runId, itemId);
    }
    return { ok: true, value: result } as const;
  }

  async completeSet(
    input: Parameters<TrainingSessionGateway["completeSet"]>[0],
  ) {
    let parsed: ReturnType<typeof setCompletionInputSchema.parse>;
    try {
      parsed = setCompletionInputSchema.parse(input);
    } catch {
      return { ok: false, reason: "invalid" } as const;
    }
    const context = await this.localContext();
    if (!context) {
      return this.remote.completeSet(parsed);
    }
    const completedAt = this.now().toISOString();
    const completion = localCompletion(
      context.snapshot,
      parsed,
      completedAt,
      this.uuid(),
    );
    if (!completion.ok || !completion.value.wasCreated) {
      return completion;
    }
    const operation = this.operation(
      "complete-set",
      parsed,
      completionOperationId(parsed),
    );
    const next = applyCompletedTrainingSetWithRest(
      context.snapshot,
      parsed,
      completion.value,
    );
    if (!(await this.persist(context.ownerId, operation, next))) {
      return this.remote.completeSet(parsed);
    }
    return completion;
  }

  async dismissRest(runId: string) {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return { ok: false, reason: "session" } as const;
    }
    try {
      const snapshot = await this.store.readSnapshot(ownerId);
      if (!snapshot || snapshot.activeRun?.runId !== runId) {
        return { ok: false, reason: "invalid" } as const;
      }
      const next = { ...snapshot, activeRest: null };
      await this.store.saveSnapshot(ownerId, next);
      return { ok: true, value: next } as const;
    } catch {
      this.blockLocalPersistence();
      return { ok: false, reason: "unexpected" } as const;
    }
  }

  async adjustRest(runId: string, additionalSeconds: number) {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return { ok: false, reason: "session" } as const;
    }
    try {
      const storedSnapshot = await this.store.readSnapshot(ownerId);
      const snapshot = storedSnapshot
        ? withoutExpiredRest(storedSnapshot, this.now())
        : null;
      if (
        !snapshot ||
        snapshot.activeRun?.runId !== runId ||
        !snapshot.activeRest ||
        !Number.isInteger(additionalSeconds) ||
        additionalSeconds <= 0
      ) {
        return { ok: false, reason: "invalid" } as const;
      }
      const next = extendActiveTrainingRest(snapshot, runId, additionalSeconds);
      if (next === snapshot) {
        return { ok: false, reason: "invalid" } as const;
      }
      await this.store.saveSnapshot(ownerId, next);
      return { ok: true, value: next } as const;
    } catch {
      this.blockLocalPersistence();
      return { ok: false, reason: "unexpected" } as const;
    }
  }

  async reviseSet(input: Parameters<TrainingSessionGateway["reviseSet"]>[0]) {
    let parsed: ReturnType<typeof setRevisionInputSchema.parse>;
    try {
      parsed = setRevisionInputSchema.parse(input);
    } catch {
      return { ok: false, reason: "invalid" } as const;
    }
    const context = await this.localContext();
    if (!context) {
      return this.remote.reviseSet(parsed);
    }
    const changedAt = this.now().toISOString();
    const revision = localRevision(context.snapshot, parsed, changedAt);
    if (!revision.ok) {
      return revision;
    }
    const operation = {
      ...this.operation("revise-set", parsed, revisionOperationId(parsed)),
      changedAt,
    } satisfies QueuedTrainingOperation;
    const next = applyRevisedTrainingSet(
      context.snapshot,
      parsed,
      revision.value,
    );
    if (!(await this.persist(context.ownerId, operation, next))) {
      return this.remote.reviseSet(parsed);
    }
    return revision;
  }

  async pause(runId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.pause(runId);
    }
    const run = context.snapshot.activeRun;
    if (!run || run.runId !== runId) {
      return { ok: false, reason: "invalid" } as const;
    }
    if (run.pausedAt) {
      return {
        ok: true,
        value: {
          pausedAt: run.pausedAt,
          pausedDurationSeconds: run.pausedDurationSeconds,
          runId,
          wasChanged: false,
        },
      } as const;
    }
    const occurredAt = this.now().toISOString();
    const value: TrainingPauseState = {
      pausedAt: occurredAt,
      pausedDurationSeconds: run.pausedDurationSeconds,
      runId,
      wasChanged: true,
    };
    const operation = this.operation("pause-session", { occurredAt, runId });
    if (
      !(await this.persist(
        context.ownerId,
        operation,
        applyTrainingPauseState(context.snapshot, value),
      ))
    ) {
      return this.remote.pause(runId);
    }
    return { ok: true, value } as const;
  }

  async resume(runId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.resume(runId);
    }
    const run = context.snapshot.activeRun;
    if (!run || run.runId !== runId) {
      return { ok: false, reason: "invalid" } as const;
    }
    if (!run.pausedAt) {
      return {
        ok: true,
        value: {
          pausedAt: null,
          pausedDurationSeconds: run.pausedDurationSeconds,
          runId,
          wasChanged: false,
        },
      } as const;
    }
    const occurredAt = this.now().toISOString();
    const pausedSeconds = Math.max(
      0,
      Math.floor(
        (new Date(occurredAt).getTime() - new Date(run.pausedAt).getTime()) /
          1_000,
      ),
    );
    const value: TrainingPauseState = {
      pausedAt: null,
      pausedDurationSeconds: run.pausedDurationSeconds + pausedSeconds,
      runId,
      wasChanged: true,
    };
    const operation = this.operation("resume-session", { occurredAt, runId });
    if (
      !(await this.persist(
        context.ownerId,
        operation,
        applyTrainingPauseState(context.snapshot, value),
      ))
    ) {
      return this.remote.resume(runId);
    }
    return { ok: true, value } as const;
  }

  async cancel(runId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.cancel(runId);
    }
    if (context.snapshot.activeRun?.runId !== runId) {
      return { ok: false, reason: "invalid" } as const;
    }
    const occurredAt = this.now().toISOString();
    const operation = this.operation(
      "cancel-session",
      { occurredAt, runId },
      `training-cancel:${runId}`,
    );
    if (
      !(await this.persist(
        context.ownerId,
        operation,
        applyCancelledTraining(context.snapshot, runId),
      ))
    ) {
      return this.remote.cancel(runId);
    }
    return { ok: true, value: { runId, wasCancelled: true } } as const;
  }

  async finish(runId: string) {
    const context = await this.localContext();
    if (!context) {
      return this.remote.finish(runId);
    }
    const run = context.snapshot.activeRun;
    if (
      !run ||
      run.runId !== runId ||
      run.pausedAt ||
      run.session.items.some((item) => !item.completedAt)
    ) {
      return { ok: false, reason: "invalid" } as const;
    }
    const occurredAt = this.now().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (new Date(occurredAt).getTime() - new Date(run.startedAt).getTime()) /
          1_000,
      ) - run.pausedDurationSeconds,
    );
    const operation = this.operation(
      "finish-session",
      { occurredAt, runId },
      `training-finish:${runId}`,
    );
    const value: CompletedTrainingSession = {
      completedAt: occurredAt,
      durationSeconds,
      sessionId: runId,
      wasCreated: true,
    };
    if (
      !(await this.persist(
        context.ownerId,
        operation,
        applyFinishedTraining(context.snapshot, runId, occurredAt),
      ))
    ) {
      return this.remote.finish(runId);
    }
    return { ok: true, value } as const;
  }

  async completeExercise(runId: string, itemId: string) {
    if (this.syncState.pendingCount > 0) {
      await this.synchronize();
      if (this.syncState.pendingCount > 0) {
        return { ok: false, reason: "conflict" } as const;
      }
    }
    const result = await this.remote.completeExercise(runId, itemId);
    if (result.ok) {
      await this.refreshSnapshot();
    }
    return result;
  }

  synchronize() {
    return this.runSynchronization(true);
  }

  async resolveConflict(resolution: TrainingSessionConflictResolution) {
    if (!this.connectivity.isOnline()) {
      return { ok: false, reason: "unexpected" } as const;
    }
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return { ok: false, reason: "session" } as const;
    }
    if (resolution === "use-server") {
      const canonical = await this.remote.load();
      if (!canonical.ok) {
        return canonical;
      }
      await this.store.replaceWithCanonical(ownerId, canonical.value);
      this.updateSyncState({
        lastSyncedAt: this.now().toISOString(),
        pendingCount: 0,
        status: "synced",
      });
      return canonical;
    }
    const operations = await this.store.listOperations(ownerId);
    for (const operation of operations) {
      if (operation.status === "conflict") {
        await this.store.markPending(ownerId, operation.operationId);
      }
    }
    await this.runSynchronization(true);
    const snapshot = await this.store.readSnapshot(ownerId);
    return this.syncState.status === "conflict" || !snapshot
      ? ({ ok: false, reason: "conflict" } as const)
      : ({ ok: true, value: snapshot } as const);
  }

  private async localContext() {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return null;
    }
    try {
      const storedSnapshot = await this.store.readSnapshot(ownerId);
      const snapshot = storedSnapshot
        ? withoutExpiredRest(storedSnapshot, this.now())
        : null;
      if (snapshot && snapshot !== storedSnapshot) {
        await this.store.saveSnapshot(ownerId, snapshot);
      }
      return snapshot ? { ownerId, snapshot } : null;
    } catch {
      this.blockLocalPersistence();
      return null;
    }
  }

  private operation<
    TKind extends QueuedTrainingOperation["kind"],
    TOperation extends Extract<QueuedTrainingOperation, { kind: TKind }>,
  >(
    kind: TKind,
    input: TOperation["input"],
    operationId = `${kind}:${this.uuid()}`,
  ) {
    const createdAt = this.now().toISOString();
    return {
      attempts: 0,
      createdAt,
      input,
      kind,
      operationId,
      retryAt: createdAt,
      sequence: this.nextOperationSequence(),
      status: "pending" as const,
    } as TOperation;
  }

  private async persist(
    ownerId: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ) {
    try {
      await this.store.enqueueOperation(ownerId, operation, state);
      const operations = await this.store.listOperations(ownerId);
      this.updateSyncState({
        pendingCount: operations.length,
        status: this.connectivity.isOnline() ? "pending" : "offline",
      });
      if (this.connectivity.isOnline()) {
        queueMicrotask(() => void this.runSynchronization(false));
      }
      return true;
    } catch {
      this.blockLocalPersistence();
      return false;
    }
  }

  private async resolveOwnerId() {
    const ownerId = await this.ownerIdProvider().catch(() => null);
    if (this.activeOwnerId !== ownerId) {
      this.activeOwnerId = ownerId;
      this.updateSyncState({
        lastSyncedAt: null,
        pendingCount: 0,
        status: this.connectivity.isOnline() ? "synced" : "offline",
      });
    }
    return ownerId;
  }

  private updateSyncState(change: Partial<TrainingSessionSyncState>) {
    this.syncState = { ...this.syncState, ...change };
    for (const listener of this.listeners) {
      listener(this.syncState);
    }
  }

  private blockLocalPersistence() {
    this.updateSyncState({ status: "conflict" });
  }

  private nextOperationSequence() {
    const timestamp = this.now().getTime();
    if (timestamp !== this.sequenceTimestamp) {
      this.sequenceTimestamp = timestamp;
      this.sequenceWithinMillisecond = 0;
    }
    this.sequenceWithinMillisecond += 1;
    return timestamp * 1_000 + this.sequenceWithinMillisecond;
  }

  private reflectOperations(operations: readonly QueuedTrainingOperation[]) {
    const hasConflict = operations.some(
      (operation) => operation.status === "conflict",
    );
    this.updateSyncState({
      pendingCount: operations.length,
      status: hasConflict
        ? "conflict"
        : this.connectivity.isOnline()
          ? operations.length > 0
            ? "pending"
            : "synced"
          : "offline",
    });
  }

  private async refreshSnapshot() {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId || !this.connectivity.isOnline()) {
      return;
    }
    const remote = await this.remote.load();
    if (remote.ok) {
      try {
        const local = await this.store.readSnapshot(ownerId);
        await this.store.saveSnapshot(
          ownerId,
          preserveActiveRest(local, remote.value, this.now()),
        );
      } catch {
        this.blockLocalPersistence();
      }
    }
  }

  private runSynchronization(force: boolean) {
    this.syncPromise ??= this.synchronizeOnce(force)
      .catch(() => this.blockLocalPersistence())
      .finally(() => {
        this.syncPromise = undefined;
      });
    return this.syncPromise;
  }

  private async synchronizeOnce(force: boolean) {
    if (!this.connectivity.isOnline()) {
      this.updateSyncState({ status: "offline" });
      return;
    }
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return;
    }
    let operations = await this.store.listOperations(ownerId);
    if (operations.some((operation) => operation.status === "conflict")) {
      this.reflectOperations(operations);
      return;
    }
    if (operations.length === 0) {
      this.updateSyncState({ pendingCount: 0, status: "synced" });
      return;
    }
    this.updateSyncState({
      pendingCount: operations.length,
      status: "syncing",
    });

    while (operations.length > 0) {
      const operation = operations[0]!;
      if (
        !force &&
        new Date(operation.retryAt).getTime() > this.now().getTime()
      ) {
        this.scheduleRetry(operation.retryAt);
        this.updateSyncState({ status: "pending" });
        return;
      }
      const result = await this.replay(operation);
      if (!result.ok) {
        if (["conflict", "invalid", "session"].includes(result.reason)) {
          await this.store.markConflict(ownerId, operation.operationId);
          this.updateSyncState({ status: "conflict" });
          return;
        }
        const attempts = operation.attempts + 1;
        const retryAt = new Date(
          this.now().getTime() + retryDelayMilliseconds(attempts, this.random),
        ).toISOString();
        await this.store.markRetry(
          ownerId,
          operation.operationId,
          attempts,
          retryAt,
        );
        this.scheduleRetry(retryAt);
        this.updateSyncState({ status: "pending" });
        return;
      }

      const snapshot = await this.store.readSnapshot(ownerId);
      if (!snapshot) {
        this.updateSyncState({ status: "pending" });
        return;
      }
      const replacements =
        operation.kind === "complete-set" && result.completion
          ? operations
              .filter(
                (
                  candidate,
                ): candidate is Extract<
                  QueuedTrainingOperation,
                  { kind: "revise-set" }
                > =>
                  candidate.kind === "revise-set" &&
                  candidate.sequence > operation.sequence &&
                  candidate.input.runId === operation.input.runId &&
                  candidate.input.itemId === operation.input.itemId &&
                  candidate.input.setNumber === operation.input.setNumber,
              )
              .map((candidate) => ({
                ...candidate,
                input: {
                  ...candidate.input,
                  setExecutionId: result.completion!.setExecutionId,
                },
              }))
          : [];
      await this.store.confirmOperation(
        ownerId,
        operation.operationId,
        snapshot,
        replacements,
      );
      operations = await this.store.listOperations(ownerId);
    }

    const canonical = await this.remote.load();
    if (canonical.ok) {
      const local = await this.store.readSnapshot(ownerId);
      await this.store.replaceWithCanonical(
        ownerId,
        preserveActiveRest(local, canonical.value, this.now()),
      );
    }
    operations = await this.store.listOperations(ownerId);
    this.updateSyncState({
      lastSyncedAt: this.now().toISOString(),
      pendingCount: operations.length,
      status: operations.length === 0 ? "synced" : "pending",
    });
  }

  private async replay(
    operation: QueuedTrainingOperation,
  ): Promise<
    | { readonly ok: true; readonly completion?: SetCompletion }
    | { readonly ok: false; readonly reason: string }
  > {
    switch (operation.kind) {
      case "start-session": {
        const result = await this.remote.startWithIdentity({
          plannedSessionId: operation.input.plannedSessionId,
          runId: operation.input.runId,
          startedAt: operation.input.startedAt,
        });
        return result.ok ? { ok: true } : result;
      }
      case "start-exercise": {
        const result = await this.remote.startExercise(
          operation.input.runId,
          operation.input.itemId,
        );
        return result.ok ? { ok: true } : result;
      }
      case "complete-set": {
        const result = await this.remote.completeSet(operation.input);
        return result.ok ? { ok: true, completion: result.value } : result;
      }
      case "revise-set": {
        const result = await this.remote.reviseSet(operation.input);
        return result.ok ? { ok: true } : result;
      }
      case "pause-session": {
        const result = await this.remote.pauseAt(
          operation.input.runId,
          operation.input.occurredAt,
        );
        return result.ok ? { ok: true } : result;
      }
      case "resume-session": {
        const result = await this.remote.resumeAt(
          operation.input.runId,
          operation.input.occurredAt,
        );
        return result.ok ? { ok: true } : result;
      }
      case "cancel-session": {
        const result = await this.remote.cancelOnce(
          operation.input.runId,
          operation.operationId,
        );
        return result.ok ? { ok: true } : result;
      }
      case "finish-session": {
        const result = await this.remote.finishAt(
          operation.input.runId,
          operation.input.occurredAt,
        );
        return result.ok ? { ok: true } : result;
      }
    }
    return { ok: false, reason: "unexpected" };
  }

  private scheduleRetry(retryAt: string) {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    const delay = Math.max(
      0,
      new Date(retryAt).getTime() - this.now().getTime(),
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.runSynchronization(false);
    }, delay);
  }
}

export function createTrainingSessionLocalFirstRuntime(
  dependencies: LocalFirstTrainingSessionDependencies,
) {
  return new TrainingSessionLocalFirstRuntime(dependencies);
}
