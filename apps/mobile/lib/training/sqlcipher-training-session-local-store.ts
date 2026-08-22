import {
  practicalTrainingStateSchema,
  queuedTrainingOperationSchema,
  trainingOutboxTimestampSchema,
  type PracticalTrainingState,
  type QueuedTrainingOperation,
  type TrainingSessionLocalStore,
} from "@daygym/contracts";

import type {
  EncryptedDatabase,
  SqlSession,
} from "../database/local-database-bootstrap";

type DatabaseProvider = () => Promise<EncryptedDatabase>;

interface SnapshotRow {
  readonly state_json: string;
}

interface OperationRow {
  readonly attempts: number;
  readonly created_at: string;
  readonly kind: QueuedTrainingOperation["kind"];
  readonly operation_id: string;
  readonly payload_json: string;
  readonly retry_at: string;
  readonly sequence: number;
  readonly status: "conflict" | "pending";
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const epoch = new Date(0).toISOString();

const readSnapshotSql = `SELECT state_json
  FROM training_session_snapshots
  WHERE owner_id = ?`;
const readOperationsSql = `SELECT attempts, created_at, kind, operation_id,
    payload_json, retry_at, sequence, status
  FROM training_outbox_operations
  WHERE owner_id = ?
  ORDER BY sequence ASC`;
const upsertSnapshotSql = `INSERT INTO training_session_snapshots (
    owner_id, state_json, updated_at
  ) VALUES (?, ?, ?)
  ON CONFLICT (owner_id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at`;
const upsertOperationSql = `INSERT INTO training_outbox_operations (
    owner_id, operation_id, sequence, status, attempts,
    retry_at, kind, payload_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (owner_id, operation_id) DO UPDATE SET
    sequence = excluded.sequence,
    status = excluded.status,
    attempts = excluded.attempts,
    retry_at = excluded.retry_at,
    kind = excluded.kind,
    payload_json = excluded.payload_json,
    created_at = excluded.created_at`;

function assertOwnerId(ownerId: string) {
  if (!uuidPattern.test(ownerId)) {
    throw new Error("INVALID_TRAINING_OWNER_ID");
  }
}

function assertOperationId(operationId: string) {
  if (
    operationId.length < 16 ||
    operationId.length > 128 ||
    !operationIdPattern.test(operationId)
  ) {
    throw new Error("INVALID_TRAINING_OPERATION_ID");
  }
}

function assertRetry(attempts: number, retryAt: string) {
  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new Error("INVALID_TRAINING_RETRY_ATTEMPTS");
  }
  if (!trainingOutboxTimestampSchema.safeParse(retryAt).success) {
    throw new Error("INVALID_TRAINING_RETRY_AT");
  }
}

function snapshotJson(state: PracticalTrainingState) {
  return JSON.stringify(practicalTrainingStateSchema.parse(state));
}

function operationJson(operation: QueuedTrainingOperation) {
  const parsed = queuedTrainingOperationSchema.parse(operation);
  return { parsed, value: JSON.stringify(parsed) };
}

async function upsertSnapshot(
  database: SqlSession,
  ownerId: string,
  state: PracticalTrainingState,
  updatedAt: string,
) {
  await database.run(upsertSnapshotSql, [
    ownerId,
    snapshotJson(state),
    updatedAt,
  ]);
}

async function upsertOperation(
  database: SqlSession,
  ownerId: string,
  operation: QueuedTrainingOperation,
) {
  const { parsed, value } = operationJson(operation);
  await database.run(upsertOperationSql, [
    ownerId,
    parsed.operationId,
    parsed.sequence,
    parsed.status,
    parsed.attempts,
    parsed.retryAt,
    parsed.kind,
    value,
    parsed.createdAt,
  ]);
}

export class SqlCipherTrainingSessionLocalStore implements TrainingSessionLocalStore {
  constructor(
    private readonly databaseProvider: DatabaseProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readSnapshot(ownerId: string) {
    assertOwnerId(ownerId);
    const database = await this.databaseProvider();
    const row = await database.getFirst<SnapshotRow>(readSnapshotSql, [
      ownerId,
    ]);
    if (!row) {
      return null;
    }

    try {
      const parsedJson: unknown = JSON.parse(row.state_json);
      const parsed = practicalTrainingStateSchema.safeParse(parsedJson);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async saveSnapshot(ownerId: string, state: PracticalTrainingState) {
    assertOwnerId(ownerId);
    const database = await this.databaseProvider();
    await upsertSnapshot(database, ownerId, state, this.now().toISOString());
  }

  async listOperations(ownerId: string) {
    assertOwnerId(ownerId);
    const database = await this.databaseProvider();
    const rows = await database.getAll<OperationRow>(readOperationsSql, [
      ownerId,
    ]);

    return rows.flatMap((row) => {
      try {
        const payload: unknown = JSON.parse(row.payload_json);
        const parsed = queuedTrainingOperationSchema.safeParse({
          ...(payload && typeof payload === "object" ? payload : {}),
          attempts: row.attempts,
          createdAt: row.created_at,
          kind: row.kind,
          operationId: row.operation_id,
          retryAt: row.retry_at,
          sequence: row.sequence,
          status: row.status,
        });
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
  }

  async enqueueOperation(
    ownerId: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ) {
    assertOwnerId(ownerId);
    const database = await this.databaseProvider();
    await database.transaction(async (transaction) => {
      await upsertSnapshot(
        transaction,
        ownerId,
        state,
        this.now().toISOString(),
      );
      await upsertOperation(transaction, ownerId, operation);
    });
  }

  async confirmOperation(
    ownerId: string,
    operationId: string,
    state: PracticalTrainingState,
    replacements: readonly QueuedTrainingOperation[] = [],
  ) {
    assertOwnerId(ownerId);
    assertOperationId(operationId);
    const database = await this.databaseProvider();
    await database.transaction(async (transaction) => {
      await upsertSnapshot(
        transaction,
        ownerId,
        state,
        this.now().toISOString(),
      );
      await transaction.run(
        `DELETE FROM training_outbox_operations
         WHERE owner_id = ? AND operation_id = ?`,
        [ownerId, operationId],
      );
      for (const replacement of replacements) {
        await upsertOperation(transaction, ownerId, replacement);
      }
    });
  }

  async replaceWithCanonical(ownerId: string, state: PracticalTrainingState) {
    assertOwnerId(ownerId);
    const database = await this.databaseProvider();
    await database.transaction(async (transaction) => {
      await upsertSnapshot(
        transaction,
        ownerId,
        state,
        this.now().toISOString(),
      );
      await transaction.run(
        "DELETE FROM training_outbox_operations WHERE owner_id = ?",
        [ownerId],
      );
    });
  }

  async markConflict(ownerId: string, operationId: string) {
    assertOwnerId(ownerId);
    assertOperationId(operationId);
    const database = await this.databaseProvider();
    await database.run(
      `UPDATE training_outbox_operations
       SET status = 'conflict'
       WHERE owner_id = ? AND operation_id = ?`,
      [ownerId, operationId],
    );
  }

  async markPending(ownerId: string, operationId: string) {
    assertOwnerId(ownerId);
    assertOperationId(operationId);
    const database = await this.databaseProvider();
    await database.run(
      `UPDATE training_outbox_operations
       SET status = 'pending', retry_at = ?
       WHERE owner_id = ? AND operation_id = ?`,
      [epoch, ownerId, operationId],
    );
  }

  async markRetry(
    ownerId: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ) {
    assertOwnerId(ownerId);
    assertOperationId(operationId);
    assertRetry(attempts, retryAt);
    const database = await this.databaseProvider();
    await database.run(
      `UPDATE training_outbox_operations
       SET attempts = ?, retry_at = ?
       WHERE owner_id = ? AND operation_id = ?`,
      [attempts, retryAt, ownerId, operationId],
    );
  }
}
