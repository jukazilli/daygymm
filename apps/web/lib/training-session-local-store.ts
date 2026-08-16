import { z } from "zod";

import {
  practicalTrainingStateSchema,
  setCompletionInputSchema,
  setRevisionInputSchema,
  type PracticalTrainingState,
} from "@daygym/contracts";

const operationBaseSchema = z.object({
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  operationId: z.string().min(16).max(128),
  retryAt: z.string().datetime({ offset: true }),
  sequence: z.number().int().nonnegative(),
  status: z.enum(["conflict", "pending"]),
});

const timedRunInputSchema = z
  .object({
    occurredAt: z.string().datetime({ offset: true }),
    runId: z.string().uuid(),
  })
  .strict();

export const queuedTrainingOperationSchema = z.discriminatedUnion("kind", [
  operationBaseSchema.extend({
    input: z
      .object({
        plannedSessionId: z.string().uuid(),
        runId: z.string().uuid(),
        startedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    kind: z.literal("start-session"),
  }),
  operationBaseSchema.extend({
    input: z
      .object({
        itemId: z.string().uuid(),
        runId: z.string().uuid(),
        startedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    kind: z.literal("start-exercise"),
  }),
  operationBaseSchema.extend({
    input: setCompletionInputSchema,
    kind: z.literal("complete-set"),
  }),
  operationBaseSchema.extend({
    changedAt: z.string().datetime({ offset: true }),
    input: setRevisionInputSchema,
    kind: z.literal("revise-set"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("pause-session"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("resume-session"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("cancel-session"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("finish-session"),
  }),
]);

export type QueuedTrainingOperation = z.infer<
  typeof queuedTrainingOperationSchema
>;

export interface TrainingSessionLocalStore {
  confirmOperation(
    ownerId: string,
    operationId: string,
    state: PracticalTrainingState,
    replacements?: readonly QueuedTrainingOperation[],
  ): Promise<void>;
  enqueueOperation(
    ownerId: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ): Promise<void>;
  listOperations(ownerId: string): Promise<QueuedTrainingOperation[]>;
  markConflict(ownerId: string, operationId: string): Promise<void>;
  markPending(ownerId: string, operationId: string): Promise<void>;
  markRetry(
    ownerId: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ): Promise<void>;
  readSnapshot(ownerId: string): Promise<PracticalTrainingState | null>;
  replaceWithCanonical(
    ownerId: string,
    state: PracticalTrainingState,
  ): Promise<void>;
  saveSnapshot(ownerId: string, state: PracticalTrainingState): Promise<void>;
}

interface SnapshotRecord {
  readonly ownerId: string;
  readonly state: PracticalTrainingState;
  readonly updatedAt: string;
}

type OperationRecord = QueuedTrainingOperation & {
  readonly id: string;
  readonly ownerId: string;
};

const DATABASE_NAME = "daygym-training-local";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "session-snapshots";
const OPERATION_STORE = "outbox-operations";

function operationRecordId(ownerId: string, operationId: string) {
  return `${ownerId}:${operationId}`;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("INDEXED_DB_REQUEST_FAILED")),
    );
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_ABORTED")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_FAILED")),
    );
  });
}

function snapshotRecord(ownerId: string, state: PracticalTrainingState) {
  return {
    ownerId,
    state: practicalTrainingStateSchema.parse(state),
    updatedAt: new Date().toISOString(),
  } satisfies SnapshotRecord;
}

function operationRecord(
  ownerId: string,
  operation: QueuedTrainingOperation,
): OperationRecord {
  return {
    ...queuedTrainingOperationSchema.parse(operation),
    id: operationRecordId(ownerId, operation.operationId),
    ownerId,
  };
}

export class IndexedDbTrainingSessionLocalStore implements TrainingSessionLocalStore {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly indexedDb: IDBFactory = window.indexedDB) {}

  async readSnapshot(ownerId: string) {
    const database = await this.open();
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(SNAPSHOT_STORE).get(ownerId),
    );
    await transactionDone(transaction);
    if (!record) {
      return null;
    }

    const parsed = practicalTrainingStateSchema.safeParse(
      (record as SnapshotRecord).state,
    );
    return parsed.success ? parsed.data : null;
  }

  async saveSnapshot(ownerId: string, state: PracticalTrainingState) {
    const database = await this.open();
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).put(snapshotRecord(ownerId, state));
    await transactionDone(transaction);
  }

  async listOperations(ownerId: string) {
    const database = await this.open();
    const transaction = database.transaction(OPERATION_STORE, "readonly");
    const index = transaction.objectStore(OPERATION_STORE).index("ownerId");
    const records = (await requestResult(
      index.getAll(IDBKeyRange.only(ownerId)),
    )) as OperationRecord[];
    await transactionDone(transaction);

    return records
      .map((record) => {
        const parsed = queuedTrainingOperationSchema.safeParse(record);
        return parsed.success ? parsed.data : null;
      })
      .filter(
        (operation): operation is QueuedTrainingOperation => operation !== null,
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async enqueueOperation(
    ownerId: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ) {
    const database = await this.open();
    const transaction = database.transaction(
      [SNAPSHOT_STORE, OPERATION_STORE],
      "readwrite",
    );
    transaction.objectStore(SNAPSHOT_STORE).put(snapshotRecord(ownerId, state));
    transaction
      .objectStore(OPERATION_STORE)
      .put(operationRecord(ownerId, operation));
    await transactionDone(transaction);
  }

  async confirmOperation(
    ownerId: string,
    operationId: string,
    state: PracticalTrainingState,
    replacements: readonly QueuedTrainingOperation[] = [],
  ) {
    const database = await this.open();
    const transaction = database.transaction(
      [SNAPSHOT_STORE, OPERATION_STORE],
      "readwrite",
    );
    transaction.objectStore(SNAPSHOT_STORE).put(snapshotRecord(ownerId, state));
    const operations = transaction.objectStore(OPERATION_STORE);
    operations.delete(operationRecordId(ownerId, operationId));
    for (const replacement of replacements) {
      operations.put(operationRecord(ownerId, replacement));
    }
    await transactionDone(transaction);
  }

  async replaceWithCanonical(ownerId: string, state: PracticalTrainingState) {
    const database = await this.open();
    const transaction = database.transaction(
      [SNAPSHOT_STORE, OPERATION_STORE],
      "readwrite",
    );
    transaction.objectStore(SNAPSHOT_STORE).put(snapshotRecord(ownerId, state));
    const operations = transaction.objectStore(OPERATION_STORE);
    const keys = await requestResult(
      operations.index("ownerId").getAllKeys(IDBKeyRange.only(ownerId)),
    );
    for (const key of keys) {
      operations.delete(key);
    }
    await transactionDone(transaction);
  }

  async markConflict(ownerId: string, operationId: string) {
    await this.updateOperation(ownerId, operationId, (record) => ({
      ...record,
      status: "conflict",
    }));
  }

  async markPending(ownerId: string, operationId: string) {
    await this.updateOperation(ownerId, operationId, (record) => ({
      ...record,
      retryAt: new Date(0).toISOString(),
      status: "pending",
    }));
  }

  async markRetry(
    ownerId: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ) {
    await this.updateOperation(ownerId, operationId, (record) => ({
      ...record,
      attempts,
      retryAt,
    }));
  }

  private async updateOperation(
    ownerId: string,
    operationId: string,
    update: (record: OperationRecord) => OperationRecord,
  ) {
    const database = await this.open();
    const transaction = database.transaction(OPERATION_STORE, "readwrite");
    const store = transaction.objectStore(OPERATION_STORE);
    const id = operationRecordId(ownerId, operationId);
    const current = (await requestResult(store.get(id))) as
      OperationRecord | undefined;
    if (current) {
      store.put(update(current));
    }
    await transactionDone(transaction);
  }

  private open() {
    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: "ownerId" });
        }
        if (!database.objectStoreNames.contains(OPERATION_STORE)) {
          const store = database.createObjectStore(OPERATION_STORE, {
            keyPath: "id",
          });
          store.createIndex("ownerId", "ownerId", { unique: false });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("INDEXED_DB_OPEN_FAILED")),
      );
      request.addEventListener("blocked", () =>
        reject(new Error("INDEXED_DB_UPGRADE_BLOCKED")),
      );
    });
    return this.databasePromise;
  }
}
