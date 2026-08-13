import { describe, expect, it, vi } from "vitest";

import {
  readWorkerDatabaseUrl,
  WorkerDomainEventQueue,
  WorkerQueueError,
  type WorkerQueueDatabase,
} from "./worker-queue.js";

function buildDatabase(): WorkerQueueDatabase & {
  archive: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    archive: vi.fn(async () => [{ archived: true }]),
    close: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => [{ dispatched: 1 }]),
    read: vi.fn(async () => [
      {
        message_id: "9223372036854775806",
        payload: { event_name: "TrainingSessionCompleted" },
      },
    ]),
  };
}

describe("worker queue adapter", () => {
  it("dispatches and reads only bounded batches without truncating bigint IDs", async () => {
    const database = buildDatabase();
    const queue = new WorkerDomainEventQueue(database);

    await expect(queue.dispatch(10)).resolves.toBe(1);
    await expect(queue.read(30, 10)).resolves.toEqual([
      {
        messageId: "9223372036854775806",
        payload: { event_name: "TrainingSessionCompleted" },
      },
    ]);
    expect(database.dispatch).toHaveBeenCalledWith(10);
    expect(database.read).toHaveBeenCalledWith(30, 10);
  });

  it("archives only when the database confirms the live message was moved", async () => {
    const database = buildDatabase();
    const queue = new WorkerDomainEventQueue(database);

    await expect(queue.archive("42")).resolves.toBeUndefined();
    expect(database.archive).toHaveBeenCalledWith("42");

    database.archive.mockResolvedValueOnce([{ archived: false }]);
    await expect(queue.archive("42")).rejects.toMatchObject({
      code: "database.response.invalid",
    });
  });

  it("fails closed on malformed database responses", async () => {
    const database = buildDatabase();
    const queue = new WorkerDomainEventQueue(database);
    database.read.mockResolvedValueOnce([
      { message_id: "7 token=secret", payload: { private: "value" } },
    ]);

    const rejection = queue.read(30, 10);
    await expect(rejection).rejects.toEqual(
      new WorkerQueueError("database.response.invalid"),
    );
    await rejection.catch((error: unknown) => {
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain("private");
    });
  });

  it("maps driver failures to a safe stable error", async () => {
    const database = buildDatabase();
    const queue = new WorkerDomainEventQueue(database);
    database.dispatch.mockRejectedValueOnce(
      new Error("postgres://admin:password@example.test/database"),
    );

    await expect(queue.dispatch(1)).rejects.toEqual(
      new WorkerQueueError("database.unavailable"),
    );
  });

  it("reads only an absolute secret file containing the dedicated worker role", () => {
    const readSecret = vi.fn(
      () =>
        "postgresql://daygym_worker_runtime.project-ref:password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    );

    expect(
      readWorkerDatabaseUrl(
        { DAYGYM_DATABASE_URL_FILE: "/var/run/secrets/daygym/database-url" },
        readSecret,
      ),
    ).toContain("daygym_worker_runtime");
    expect(readSecret).toHaveBeenCalledWith(
      "/var/run/secrets/daygym/database-url",
      "utf8",
    );
  });

  it("rejects privileged or inline database configuration", () => {
    expect(() =>
      readWorkerDatabaseUrl(
        { DAYGYM_DATABASE_URL_FILE: "relative/database-url" },
        () => "unused",
      ),
    ).toThrowError(new WorkerQueueError("database.configuration.invalid"));

    expect(() =>
      readWorkerDatabaseUrl(
        { DAYGYM_DATABASE_URL_FILE: "/safe/path" },
        () =>
          "postgresql://postgres:admin@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrowError(new WorkerQueueError("database.configuration.invalid"));
  });
});
