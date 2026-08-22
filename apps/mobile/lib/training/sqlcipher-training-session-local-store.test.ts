import { describe, expect, it } from "vitest";

import type {
  PracticalTrainingState,
  QueuedTrainingOperation,
} from "@daygym/contracts";

import type {
  EncryptedDatabase,
  SqlParameter,
  SqlSession,
} from "../database/local-database-bootstrap";
import { localMigrations } from "../database/local-migrations";
import { SqlCipherTrainingSessionLocalStore } from "./sqlcipher-training-session-local-store";

const ownerId = "60000000-0000-4000-8000-000000000001";
const otherOwnerId = "60000000-0000-4000-8000-000000000009";
const runId = "60000000-0000-4000-8000-000000000002";
const itemId = "60000000-0000-4000-8000-000000000003";
const sessionId = "60000000-0000-4000-8000-000000000004";

interface StoredSnapshot {
  readonly state_json: string;
  readonly updated_at: string;
}

interface StoredOperation {
  attempts: number;
  readonly created_at: string;
  readonly kind: string;
  readonly operation_id: string;
  readonly owner_id: string;
  readonly payload_json: string;
  retry_at: string;
  readonly sequence: number;
  status: "conflict" | "pending";
}

function activeState(): PracticalTrainingState {
  const session = {
    dayOrder: 1,
    items: [
      {
        approvedAlternatives: [],
        circuitGroup: null,
        completedAt: null,
        distanceMeters: null,
        durationSeconds: null,
        exerciseName: "Agachamento",
        itemId,
        modality: "strength" as const,
        notes: null,
        order: 1,
        plannedExerciseName: "Agachamento",
        plannedWeightKg: 40,
        previousSetReferences: [],
        repsMax: 12,
        repsMin: 8,
        restSeconds: 90,
        setProgressionKg: 2.5,
        sets: 2,
        setExecutions: [],
        startedAt: "2026-08-16T20:01:00.000Z",
        substitution: null,
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
      startedAt: "2026-08-16T20:00:00.000Z",
    },
    lastCompletedAt: null,
    nextSession: session,
    plan: {
      itemCount: 1,
      name: "Plano móvel",
      planId: "60000000-0000-4000-8000-000000000005",
      sessionCount: 1,
      version: 1,
      versionId: "60000000-0000-4000-8000-000000000006",
      wasCreated: false,
    },
    sessions: [session],
  };
}

function idleState(): PracticalTrainingState {
  return { ...activeState(), activeRun: null };
}

function timedOperation(
  kind: "pause-session" | "resume-session",
  sequence: number,
): QueuedTrainingOperation {
  const occurredAt = `2026-08-16T20:0${sequence}:00.000Z`;
  return {
    attempts: 0,
    createdAt: occurredAt,
    input: { occurredAt, runId },
    kind,
    operationId: `training-${kind}:${runId}:${sequence}`,
    retryAt: new Date(0).toISOString(),
    sequence,
    status: "pending",
  };
}

function operationKey(owner: string, operationId: string) {
  return `${owner}:${operationId}`;
}

class FakeEncryptedDatabase implements EncryptedDatabase {
  readonly snapshots = new Map<string, StoredSnapshot>();
  readonly operations = new Map<string, StoredOperation>();
  failOperationUpsert = false;

  async close() {}
  async exec(source: string) {
    void source;
  }

  async getAll<T>(
    source: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<T[]> {
    if (!source.includes("FROM training_outbox_operations")) {
      throw new Error("UNEXPECTED_GET_ALL");
    }
    const owner = String(parameters[0]);
    return [...this.operations.values()]
      .filter((operation) => operation.owner_id === owner)
      .sort((left, right) => left.sequence - right.sequence)
      .map((operation) => ({
        attempts: operation.attempts,
        created_at: operation.created_at,
        kind: operation.kind,
        operation_id: operation.operation_id,
        payload_json: operation.payload_json,
        retry_at: operation.retry_at,
        sequence: operation.sequence,
        status: operation.status,
      })) as T[];
  }

  async getFirst<T>(
    source: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<T | null> {
    if (!source.includes("FROM training_session_snapshots")) {
      throw new Error("UNEXPECTED_GET_FIRST");
    }
    const snapshot = this.snapshots.get(String(parameters[0]));
    return snapshot ? ({ state_json: snapshot.state_json } as T) : null;
  }

  async run(
    source: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<void> {
    if (source.includes("INSERT INTO training_session_snapshots")) {
      this.snapshots.set(String(parameters[0]), {
        state_json: String(parameters[1]),
        updated_at: String(parameters[2]),
      });
      return;
    }
    if (source.includes("INSERT INTO training_outbox_operations")) {
      if (this.failOperationUpsert) {
        throw new Error("SIMULATED_OPERATION_WRITE_FAILURE");
      }
      const operation: StoredOperation = {
        owner_id: String(parameters[0]),
        operation_id: String(parameters[1]),
        sequence: Number(parameters[2]),
        status: String(parameters[3]) as "conflict" | "pending",
        attempts: Number(parameters[4]),
        retry_at: String(parameters[5]),
        kind: String(parameters[6]),
        payload_json: String(parameters[7]),
        created_at: String(parameters[8]),
      };
      this.operations.set(
        operationKey(operation.owner_id, operation.operation_id),
        operation,
      );
      return;
    }
    if (source.includes("operation_id = ?") && source.includes("DELETE")) {
      this.operations.delete(
        operationKey(String(parameters[0]), String(parameters[1])),
      );
      return;
    }
    if (source.includes("DELETE FROM training_outbox_operations")) {
      const owner = String(parameters[0]);
      for (const [key, operation] of this.operations) {
        if (operation.owner_id === owner) {
          this.operations.delete(key);
        }
      }
      return;
    }
    if (source.includes("SET status = 'conflict'")) {
      const operation = this.operations.get(
        operationKey(String(parameters[0]), String(parameters[1])),
      );
      if (operation) operation.status = "conflict";
      return;
    }
    if (source.includes("SET status = 'pending'")) {
      const operation = this.operations.get(
        operationKey(String(parameters[1]), String(parameters[2])),
      );
      if (operation) {
        operation.status = "pending";
        operation.retry_at = String(parameters[0]);
      }
      return;
    }
    if (source.includes("SET attempts = ?")) {
      const operation = this.operations.get(
        operationKey(String(parameters[2]), String(parameters[3])),
      );
      if (operation) {
        operation.attempts = Number(parameters[0]);
        operation.retry_at = String(parameters[1]);
      }
      return;
    }
    throw new Error("UNEXPECTED_RUN");
  }

  async transaction(task: (transaction: SqlSession) => Promise<void>) {
    const snapshotsBefore = new Map(this.snapshots);
    const operationsBefore = new Map(this.operations);
    try {
      await task(this);
    } catch (error) {
      this.snapshots.clear();
      this.operations.clear();
      for (const [key, value] of snapshotsBefore)
        this.snapshots.set(key, value);
      for (const [key, value] of operationsBefore)
        this.operations.set(key, value);
      throw error;
    }
  }

  injectMalformedOperation(owner: string) {
    this.operations.set(operationKey(owner, "malformed-operation"), {
      attempts: 0,
      created_at: "invalid",
      kind: "pause-session",
      operation_id: "malformed-operation",
      owner_id: owner,
      payload_json: "{not-json",
      retry_at: new Date(0).toISOString(),
      sequence: 99,
      status: "pending",
    });
  }
}

function store(database: FakeEncryptedDatabase) {
  return new SqlCipherTrainingSessionLocalStore(
    async () => database,
    () => new Date("2026-08-16T21:00:00.000Z"),
  );
}

describe("SqlCipherTrainingSessionLocalStore", () => {
  it("defines the encrypted snapshot and causal outbox schema in migration 2", () => {
    const migration = localMigrations.find((entry) => entry.version === 2);
    const sql = migration?.statements.join("\n") ?? "";

    expect(migration?.name).toBe("training-session-outbox");
    expect(sql).toContain("training_session_snapshots");
    expect(sql).toContain("training_outbox_operations");
    expect(sql).toContain("UNIQUE (owner_id, sequence)");
    expect(sql).toContain("training_outbox_owner_sequence_idx");
  });

  it("round-trips a valid snapshot without storing identity inside its JSON", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);

    await repository.saveSnapshot(ownerId, activeState());

    expect(await repository.readSnapshot(ownerId)).toEqual(activeState());
    expect(database.snapshots.get(ownerId)?.state_json).not.toContain(ownerId);
  });

  it("atomically stores snapshot and operation and isolates owners", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    const later = timedOperation("resume-session", 2);
    const earlier = timedOperation("pause-session", 1);

    await repository.enqueueOperation(ownerId, later, activeState());
    await repository.enqueueOperation(ownerId, earlier, activeState());
    await repository.enqueueOperation(
      otherOwnerId,
      timedOperation("pause-session", 3),
      activeState(),
    );

    expect(
      (await repository.listOperations(ownerId)).map((item) => item.kind),
    ).toEqual(["pause-session", "resume-session"]);
    expect(await repository.listOperations(otherOwnerId)).toHaveLength(1);
  });

  it("rolls back the snapshot when operation persistence fails", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    await repository.saveSnapshot(ownerId, idleState());
    database.failOperationUpsert = true;

    await expect(
      repository.enqueueOperation(
        ownerId,
        timedOperation("pause-session", 1),
        activeState(),
      ),
    ).rejects.toThrow("SIMULATED_OPERATION_WRITE_FAILURE");

    expect(await repository.readSnapshot(ownerId)).toEqual(idleState());
    expect(await repository.listOperations(ownerId)).toEqual([]);
  });

  it("confirms one operation and atomically installs its replacement", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    const pause = timedOperation("pause-session", 1);
    const resume = timedOperation("resume-session", 2);
    await repository.enqueueOperation(ownerId, pause, activeState());

    await repository.confirmOperation(
      ownerId,
      pause.operationId,
      activeState(),
      [resume],
    );

    expect(await repository.listOperations(ownerId)).toEqual([resume]);
  });

  it("replaces one owner's state without deleting another owner's outbox", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    await repository.enqueueOperation(
      ownerId,
      timedOperation("pause-session", 1),
      activeState(),
    );
    await repository.enqueueOperation(
      otherOwnerId,
      timedOperation("pause-session", 2),
      activeState(),
    );

    await repository.replaceWithCanonical(ownerId, idleState());

    expect(await repository.listOperations(ownerId)).toEqual([]);
    expect(await repository.listOperations(otherOwnerId)).toHaveLength(1);
    expect(await repository.readSnapshot(ownerId)).toEqual(idleState());
  });

  it("persists conflict, pending and retry metadata outside stale payload JSON", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    const operation = timedOperation("pause-session", 1);
    await repository.enqueueOperation(ownerId, operation, activeState());
    const key = operationKey(ownerId, operation.operationId);
    const stored = database.operations.get(key);
    if (!stored) throw new Error("EXPECTED_STORED_OPERATION");
    database.operations.set(key, {
      ...stored,
      payload_json: JSON.stringify({
        ...JSON.parse(stored.payload_json),
        createdAt: "2025-01-01T00:00:00.000Z",
        kind: "resume-session",
        operationId: "stale-operation-id",
      }),
    });

    await repository.markConflict(ownerId, operation.operationId);
    expect((await repository.listOperations(ownerId))[0]).toMatchObject({
      createdAt: operation.createdAt,
      kind: operation.kind,
      operationId: operation.operationId,
      status: "conflict",
    });

    const retryAt = "2026-08-16T21:05:00.000Z";
    await repository.markRetry(ownerId, operation.operationId, 2, retryAt);
    await repository.markPending(ownerId, operation.operationId);
    expect((await repository.listOperations(ownerId))[0]).toMatchObject({
      attempts: 2,
      retryAt: new Date(0).toISOString(),
      status: "pending",
    });
  });

  it("rejects retry timestamps outside the shared outbox contract", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    const operation = timedOperation("pause-session", 1);
    await repository.enqueueOperation(ownerId, operation, activeState());

    await expect(
      repository.markRetry(ownerId, operation.operationId, 1, "2026-08-16"),
    ).rejects.toThrow("INVALID_TRAINING_RETRY_AT");
    expect(await repository.listOperations(ownerId)).toEqual([operation]);
  });

  it("ignores malformed operation rows without losing valid commands", async () => {
    const database = new FakeEncryptedDatabase();
    const repository = store(database);
    const operation = timedOperation("pause-session", 1);
    await repository.enqueueOperation(ownerId, operation, activeState());
    database.injectMalformedOperation(ownerId);

    expect(await repository.listOperations(ownerId)).toEqual([operation]);
  });

  it("rejects an invalid owner before opening the database", async () => {
    let opened = false;
    const repository = new SqlCipherTrainingSessionLocalStore(async () => {
      opened = true;
      return new FakeEncryptedDatabase();
    });

    await expect(repository.readSnapshot("not-a-user-id")).rejects.toThrow(
      "INVALID_TRAINING_OWNER_ID",
    );
    expect(opened).toBe(false);
  });
});
