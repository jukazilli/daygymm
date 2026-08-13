import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import postgres from "postgres";

import type {
  DomainEventQueue,
  DomainEventQueueMessage,
} from "./domain-event-consumer.js";

const positiveIntegerPattern = /^[1-9][0-9]*$/;

export type WorkerQueueErrorCode =
  | "database.configuration.invalid"
  | "database.response.invalid"
  | "database.unavailable";

export class WorkerQueueError extends Error {
  readonly code: WorkerQueueErrorCode;

  constructor(code: WorkerQueueErrorCode) {
    super(code);
    this.name = "WorkerQueueError";
    this.code = code;
  }
}

export type WorkerQueueDatabase = {
  archive(messageId: string): Promise<unknown>;
  close(): Promise<void>;
  dispatch(batchSize: number): Promise<unknown>;
  read(visibilityTimeoutSeconds: number, batchSize: number): Promise<unknown>;
};

export class WorkerDomainEventQueue implements DomainEventQueue {
  constructor(private readonly database: WorkerQueueDatabase) {}

  async dispatch(batchSize: number): Promise<number> {
    assertIntegerInRange(batchSize, 1, 10);

    let result: unknown;
    try {
      result = await this.database.dispatch(batchSize);
    } catch {
      throw new WorkerQueueError("database.unavailable");
    }

    const dispatched = readSingleField(result, "dispatched");
    if (
      typeof dispatched !== "number" ||
      !Number.isInteger(dispatched) ||
      dispatched < 0 ||
      dispatched > batchSize
    ) {
      throw new WorkerQueueError("database.response.invalid");
    }

    return dispatched;
  }

  async read(
    visibilityTimeoutSeconds: number,
    batchSize: number,
  ): Promise<DomainEventQueueMessage[]> {
    assertIntegerInRange(visibilityTimeoutSeconds, 5, 300);
    assertIntegerInRange(batchSize, 1, 10);

    let result: unknown;
    try {
      result = await this.database.read(visibilityTimeoutSeconds, batchSize);
    } catch {
      throw new WorkerQueueError("database.unavailable");
    }

    if (!Array.isArray(result) || result.length > batchSize) {
      throw new WorkerQueueError("database.response.invalid");
    }

    return result.map((row) => {
      if (!isRecord(row)) {
        throw new WorkerQueueError("database.response.invalid");
      }

      const messageId = normalizeMessageId(row.message_id);
      return {
        messageId,
        payload: row.payload,
      };
    });
  }

  async archive(messageId: string): Promise<void> {
    if (!positiveIntegerPattern.test(messageId)) {
      throw new WorkerQueueError("database.response.invalid");
    }

    let result: unknown;
    try {
      result = await this.database.archive(messageId);
    } catch {
      throw new WorkerQueueError("database.unavailable");
    }

    if (readSingleField(result, "archived") !== true) {
      throw new WorkerQueueError("database.response.invalid");
    }
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}

export function createPostgresWorkerQueueDatabase(
  databaseUrl: string,
): WorkerQueueDatabase {
  assertWorkerDatabaseUrl(databaseUrl);

  const sql = postgres(databaseUrl, {
    connect_timeout: 10,
    connection: {
      application_name: "daygym-worker",
    },
    fetch_types: false,
    idle_timeout: 20,
    max: 1,
    max_lifetime: 300,
    onnotice: () => undefined,
    prepare: false,
    ssl: "require",
  });

  return {
    async dispatch(batchSize) {
      return sql`
        select private.worker_dispatch_domain_events(${batchSize}) as dispatched
      `;
    },
    async read(visibilityTimeoutSeconds, batchSize) {
      return sql`
        select message_id, payload
        from private.worker_read_domain_events(
          ${visibilityTimeoutSeconds},
          ${batchSize}
        )
      `;
    },
    async archive(messageId) {
      return sql`
        select private.worker_archive_domain_event(
          ${messageId}::bigint
        ) as archived
      `;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

export function readWorkerDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
  readSecret: (path: string, encoding: BufferEncoding) => string = readFileSync,
): string {
  const secretPath = environment.DAYGYM_DATABASE_URL_FILE;
  if (!secretPath || !isAbsolute(secretPath)) {
    throw new WorkerQueueError("database.configuration.invalid");
  }

  let databaseUrl: string;
  try {
    databaseUrl = readSecret(secretPath, "utf8").trim();
  } catch {
    throw new WorkerQueueError("database.configuration.invalid");
  }

  assertWorkerDatabaseUrl(databaseUrl);
  return databaseUrl;
}

function assertWorkerDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkerQueueError("database.configuration.invalid");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".supabase.com") ||
    !url.username.startsWith("daygym_worker_runtime") ||
    !url.password
  ) {
    throw new WorkerQueueError("database.configuration.invalid");
  }
}

function assertIntegerInRange(value: number, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new WorkerQueueError("database.configuration.invalid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMessageId(value: unknown): string {
  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : value;

  if (
    typeof normalized !== "string" ||
    !positiveIntegerPattern.test(normalized)
  ) {
    throw new WorkerQueueError("database.response.invalid");
  }

  return normalized;
}

function readSingleField(result: unknown, field: string): unknown {
  if (!Array.isArray(result) || result.length !== 1 || !isRecord(result[0])) {
    throw new WorkerQueueError("database.response.invalid");
  }

  return result[0][field];
}
