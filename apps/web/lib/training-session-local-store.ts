import {
  practicalTrainingStateSchema,
  setCompletionInputSchema,
  type PracticalTrainingState,
  type SetCompletionInput,
} from "@daygym/contracts";

export interface QueuedTrainingSetCompletion {
  readonly attempts: number;
  readonly createdAt: string;
  readonly input: SetCompletionInput;
  readonly kind: "complete-set";
  readonly operationId: string;
  readonly retryAt: string;
  readonly sequence: number;
  readonly status: "conflict" | "pending";
}

export interface TrainingSessionLocalStore {
  confirmCompletion(
    ownerId: string,
    operationId: string,
    state: PracticalTrainingState,
  ): Promise<void>;
  enqueueCompletion(
    ownerId: string,
    operation: QueuedTrainingSetCompletion,
    state: PracticalTrainingState,
  ): Promise<void>;
  listCompletions(ownerId: string): Promise<QueuedTrainingSetCompletion[]>;
  markConflict(ownerId: string, operationId: string): Promise<void>;
  markRetry(
    ownerId: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ): Promise<void>;
  readSnapshot(ownerId: string): Promise<PracticalTrainingState | null>;
  saveSnapshot(ownerId: string, state: PracticalTrainingState): Promise<void>;
}

interface SnapshotRecord {
  readonly ownerId: string;
  readonly state: PracticalTrainingState;
  readonly updatedAt: string;
}

interface OperationRecord extends QueuedTrainingSetCompletion {
  readonly id: string;
  readonly ownerId: string;
}

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

  async listCompletions(ownerId: string) {
    const database = await this.open();
    const transaction = database.transaction(OPERATION_STORE, "readonly");
    const index = transaction.objectStore(OPERATION_STORE).index("ownerId");
    const records = (await requestResult(
      index.getAll(IDBKeyRange.only(ownerId)),
    )) as OperationRecord[];
    await transactionDone(transaction);

    return records
      .map((record) => {
        const input = setCompletionInputSchema.safeParse(record.input);
        if (!input.success || record.kind !== "complete-set") {
          return null;
        }
        return {
          attempts: record.attempts,
          createdAt: record.createdAt,
          input: input.data,
          kind: record.kind,
          operationId: record.operationId,
          retryAt: record.retryAt,
          sequence:
            typeof record.sequence === "number"
              ? record.sequence
              : new Date(record.createdAt).getTime(),
          status: record.status,
        } satisfies QueuedTrainingSetCompletion;
      })
      .filter(
        (operation): operation is QueuedTrainingSetCompletion =>
          operation !== null,
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async enqueueCompletion(
    ownerId: string,
    operation: QueuedTrainingSetCompletion,
    state: PracticalTrainingState,
  ) {
    const database = await this.open();
    const transaction = database.transaction(
      [SNAPSHOT_STORE, OPERATION_STORE],
      "readwrite",
    );
    transaction.objectStore(SNAPSHOT_STORE).put(snapshotRecord(ownerId, state));
    transaction.objectStore(OPERATION_STORE).put({
      ...operation,
      id: operationRecordId(ownerId, operation.operationId),
      ownerId,
    } satisfies OperationRecord);
    await transactionDone(transaction);
  }

  async confirmCompletion(
    ownerId: string,
    operationId: string,
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
      .delete(operationRecordId(ownerId, operationId));
    await transactionDone(transaction);
  }

  async markConflict(ownerId: string, operationId: string) {
    await this.updateOperation(ownerId, operationId, (record) => ({
      ...record,
      status: "conflict",
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
