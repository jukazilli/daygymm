import {
  setCompletionInputSchema,
  type LocalFirstTrainingSessionGateway,
  type PracticalTrainingState,
  type SetCompletion,
  type TrainingSessionGateway,
  type TrainingSessionResult,
  type TrainingSessionSyncState,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import {
  IndexedDbTrainingSessionLocalStore,
  type QueuedTrainingSetCompletion,
  type TrainingSessionLocalStore,
} from "./training-session-local-store";
import { applyCompletedTrainingSet } from "./training-session-state";
import { createWebTrainingSessionGateway } from "./training-session-gateway";

interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

type OwnerIdProvider = () => Promise<string | null>;

interface LocalFirstTrainingSessionDependencies {
  readonly connectivity?: Connectivity;
  readonly now?: () => Date;
  readonly ownerId?: OwnerIdProvider;
  readonly random?: () => number;
  readonly remote?: TrainingSessionGateway;
  readonly store?: TrainingSessionLocalStore;
  readonly uuid?: () => string;
}

function browserConnectivity(): Connectivity {
  return {
    isOnline: () => navigator.onLine,
    subscribe(listener) {
      const online = () => listener(true);
      const offline = () => listener(false);
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    },
  };
}

async function currentOwnerId() {
  const { data } = await getWebSupabaseClient().auth.getSession();
  return data.session?.user.id ?? null;
}

function completionOperationId(input: {
  readonly itemId: string;
  readonly runId: string;
  readonly setNumber: number;
}) {
  return `training-set:${input.runId}:${input.itemId}:${input.setNumber}`;
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

function retryDelayMilliseconds(attempts: number, random: () => number) {
  const boundedBase = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
  return Math.round(boundedBase * (0.75 + random() * 0.5));
}

export class WebLocalFirstTrainingSessionGateway implements LocalFirstTrainingSessionGateway {
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

  private readonly connectivity: Connectivity;
  private readonly now: () => Date;
  private readonly ownerIdProvider: OwnerIdProvider;
  private readonly random: () => number;
  private readonly remote: TrainingSessionGateway;
  private readonly store: TrainingSessionLocalStore;
  private readonly uuid: () => string;

  constructor(dependencies: LocalFirstTrainingSessionDependencies = {}) {
    this.connectivity = dependencies.connectivity ?? browserConnectivity();
    this.now = dependencies.now ?? (() => new Date());
    this.ownerIdProvider = dependencies.ownerId ?? currentOwnerId;
    this.random = dependencies.random ?? Math.random;
    this.remote = dependencies.remote ?? createWebTrainingSessionGateway();
    this.store = dependencies.store ?? new IndexedDbTrainingSessionLocalStore();
    this.uuid = dependencies.uuid ?? (() => crypto.randomUUID());
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
          return;
        }
        this.updateSyncState({ status: "offline" });
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

    let snapshot: PracticalTrainingState | null;
    let operations: QueuedTrainingSetCompletion[];
    try {
      [snapshot, operations] = await Promise.all([
        this.store.readSnapshot(ownerId),
        this.store.listCompletions(ownerId),
      ]);
    } catch {
      this.blockLocalPersistence();
      return this.remote.load(preferredSessionId);
    }
    this.reflectOperations(operations);

    if (operations.length > 0) {
      if (this.connectivity.isOnline()) {
        void this.runSynchronization(false);
      }
      if (snapshot) {
        return { ok: true, value: snapshot } as const;
      }
    }

    if (!this.connectivity.isOnline() && snapshot) {
      this.updateSyncState({ status: "offline" });
      return { ok: true, value: snapshot } as const;
    }

    const remote = await this.remote.load(preferredSessionId);
    if (remote.ok) {
      try {
        await this.store.saveSnapshot(ownerId, remote.value);
      } catch {
        this.blockLocalPersistence();
        return remote;
      }
      this.updateSyncState({
        lastSyncedAt: this.now().toISOString(),
        pendingCount: 0,
        status: this.connectivity.isOnline() ? "synced" : "offline",
      });
      return remote;
    }

    return snapshot ? ({ ok: true, value: snapshot } as const) : remote;
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

    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return this.remote.completeSet(parsed);
    }

    let snapshot: PracticalTrainingState | null;
    try {
      snapshot = await this.store.readSnapshot(ownerId);
    } catch {
      this.blockLocalPersistence();
      return this.remote.completeSet(parsed);
    }
    if (!snapshot) {
      return this.remote.completeSet(parsed);
    }

    const completedAt = this.now().toISOString();
    const completion = localCompletion(
      snapshot,
      parsed,
      completedAt,
      this.uuid(),
    );
    if (!completion.ok || !completion.value.wasCreated) {
      return completion;
    }

    const operation: QueuedTrainingSetCompletion = {
      attempts: 0,
      createdAt: completedAt,
      input: parsed,
      kind: "complete-set",
      operationId: completionOperationId(parsed),
      retryAt: completedAt,
      sequence: this.nextOperationSequence(),
      status: "pending",
    };
    const nextState = applyCompletedTrainingSet(
      snapshot,
      parsed,
      completion.value,
    );

    try {
      await this.store.enqueueCompletion(ownerId, operation, nextState);
    } catch {
      this.blockLocalPersistence();
      return this.remote.completeSet(parsed);
    }

    const pendingCount = await this.store
      .listCompletions(ownerId)
      .then((operations) => operations.length)
      .catch(() => this.syncState.pendingCount + 1);
    this.updateSyncState({
      pendingCount,
      status: this.connectivity.isOnline() ? "pending" : "offline",
    });
    if (this.connectivity.isOnline()) {
      queueMicrotask(() => void this.runSynchronization(false));
    }
    return completion;
  }

  async start(plannedSessionId: string) {
    const result = await this.remote.start(plannedSessionId);
    if (result.ok) {
      await this.updateSnapshot((state) => ({
        ...state,
        activeRun: result.value,
        nextSession: result.value.session,
      }));
    }
    return result;
  }

  async startExercise(runId: string, itemId: string) {
    const result = await this.remote.startExercise(runId, itemId);
    if (result.ok) {
      await this.updateSnapshot((state) => {
        if (state.activeRun?.runId !== runId) {
          return state;
        }
        const items = state.activeRun.session.items.map((item) =>
          item.itemId === itemId
            ? { ...item, startedAt: result.value.startedAt }
            : item,
        );
        const session = { ...state.activeRun.session, items };
        return {
          ...state,
          activeRun: { ...state.activeRun, session },
          nextSession:
            state.nextSession?.sessionId === session.sessionId
              ? session
              : state.nextSession,
        };
      });
    }
    return result;
  }

  async pause(runId: string) {
    const result = await this.remote.pause(runId);
    if (result.ok) {
      await this.updateSnapshot((state) =>
        state.activeRun?.runId === runId
          ? {
              ...state,
              activeRun: {
                ...state.activeRun,
                pausedAt: result.value.pausedAt,
                pausedDurationSeconds: result.value.pausedDurationSeconds,
              },
            }
          : state,
      );
    }
    return result;
  }

  async resume(runId: string) {
    const result = await this.remote.resume(runId);
    if (result.ok) {
      await this.updateSnapshot((state) =>
        state.activeRun?.runId === runId
          ? {
              ...state,
              activeRun: {
                ...state.activeRun,
                pausedAt: result.value.pausedAt,
                pausedDurationSeconds: result.value.pausedDurationSeconds,
              },
            }
          : state,
      );
    }
    return result;
  }

  async reviseSet(input: Parameters<TrainingSessionGateway["reviseSet"]>[0]) {
    if (this.syncState.pendingCount > 0) {
      return { ok: false, reason: "conflict" } as const;
    }
    const result = await this.remote.reviseSet(input);
    if (result.ok) {
      await this.refreshSnapshot();
    }
    return result;
  }

  async completeExercise(runId: string, itemId: string) {
    const result = await this.remote.completeExercise(runId, itemId);
    if (result.ok) {
      await this.refreshSnapshot();
    }
    return result;
  }

  async finish(runId: string) {
    if (this.syncState.pendingCount > 0) {
      await this.synchronize();
      if (this.syncState.pendingCount > 0) {
        return { ok: false, reason: "conflict" } as const;
      }
    }
    const result = await this.remote.finish(runId);
    if (result.ok) {
      await this.refreshSnapshot();
    }
    return result;
  }

  async cancel(runId: string) {
    if (this.syncState.pendingCount > 0) {
      return { ok: false, reason: "conflict" } as const;
    }
    const result = await this.remote.cancel(runId);
    if (result.ok) {
      await this.refreshSnapshot();
    }
    return result;
  }

  synchronize() {
    return this.runSynchronization(true);
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

  private reflectOperations(
    operations: readonly QueuedTrainingSetCompletion[],
  ) {
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

  private async updateSnapshot(
    update: (state: PracticalTrainingState) => PracticalTrainingState,
  ) {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId) {
      return;
    }
    try {
      const snapshot = await this.store.readSnapshot(ownerId);
      if (snapshot) {
        await this.store.saveSnapshot(ownerId, update(snapshot));
      }
    } catch {
      this.blockLocalPersistence();
    }
  }

  private async refreshSnapshot() {
    const ownerId = await this.resolveOwnerId();
    if (!ownerId || !this.connectivity.isOnline()) {
      return;
    }
    const remote = await this.remote.load();
    if (remote.ok) {
      try {
        await this.store.saveSnapshot(ownerId, remote.value);
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

    let operations = await this.store.listCompletions(ownerId);
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

    for (const operation of operations) {
      if (
        !force &&
        new Date(operation.retryAt).getTime() > this.now().getTime()
      ) {
        this.scheduleRetry(operation.retryAt);
        this.updateSyncState({ status: "pending" });
        return;
      }

      const result = await this.remote.completeSet(operation.input);
      if (!result.ok) {
        if (
          result.reason === "conflict" ||
          result.reason === "invalid" ||
          result.reason === "session"
        ) {
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
        this.updateSyncState({
          status: this.connectivity.isOnline() ? "pending" : "offline",
        });
        return;
      }

      const snapshot = await this.store.readSnapshot(ownerId);
      if (snapshot) {
        const canonicalState = applyCompletedTrainingSet(
          snapshot,
          operation.input,
          result.value,
        );
        await this.store.confirmCompletion(
          ownerId,
          operation.operationId,
          canonicalState,
        );
      } else {
        const canonical = await this.remote.load();
        if (!canonical.ok) {
          this.updateSyncState({ status: "pending" });
          return;
        }
        await this.store.confirmCompletion(
          ownerId,
          operation.operationId,
          canonical.value,
        );
      }
    }

    operations = await this.store.listCompletions(ownerId);
    this.updateSyncState({
      lastSyncedAt: this.now().toISOString(),
      pendingCount: operations.length,
      status: operations.length === 0 ? "synced" : "pending",
    });
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

export function createLocalFirstTrainingSessionGateway() {
  return new WebLocalFirstTrainingSessionGateway();
}
