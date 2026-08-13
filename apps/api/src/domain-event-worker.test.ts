import { describe, expect, it, vi } from "vitest";

import type { DomainEventV1 } from "@daygym/contracts";

import {
  runDomainEventWorkerCycle,
  type DomainEventWorkerQueue,
} from "./domain-event-worker.js";

const event: DomainEventV1 = {
  event_id: "76000000-0000-4000-8000-000000000022",
  event_name: "TrainingSessionCompleted",
  event_version: 1,
  occurred_at: "2026-08-13T11:00:00.000Z",
  correlation_id: "77000000-0000-4000-8000-000000000022",
  producer: "worker-cycle-test",
  payload: {
    session_id: "session-22",
    user_id: "user-22",
    occurred_at: "2026-08-13T10:59:00.000Z",
    version: 1,
  },
};

function buildQueue(): DomainEventWorkerQueue & {
  archive: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    archive: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => 1),
    read: vi.fn(async () => [
      { messageId: "50", payload: event },
      { messageId: "51", payload: event },
      { messageId: "52", payload: event },
    ]),
  };
}

describe("domain event worker cycle", () => {
  it("dispatches, reads and archives only confirmed idempotent outcomes", async () => {
    const queue = buildQueue();
    const outcomes = ["processed", "already-processed"] as const;
    let call = 0;
    const handler = {
      handleOnce: vi.fn(async () => {
        if (call === 2) throw new Error("private downstream failure");
        return outcomes[call++] ?? "already-processed";
      }),
    };

    await expect(
      runDomainEventWorkerCycle(queue, handler, {
        batchSize: 3,
        visibilityTimeoutSeconds: 30,
      }),
    ).resolves.toEqual({
      alreadyProcessed: 1,
      dispatched: 1,
      failed: 1,
      processed: 1,
      received: 3,
    });
    expect(queue.dispatch).toHaveBeenCalledWith(3);
    expect(queue.read).toHaveBeenCalledWith(30, 3);
    expect(queue.archive).toHaveBeenCalledTimes(2);
    expect(queue.archive).not.toHaveBeenCalledWith("52");
  });

  it("reports an archive failure without reflecting its details", async () => {
    const queue = buildQueue();
    queue.read.mockResolvedValueOnce([{ messageId: "53", payload: event }]);
    queue.archive.mockRejectedValueOnce(new Error("database password"));
    const handler = { handleOnce: vi.fn(async () => "processed" as const) };

    const result = await runDomainEventWorkerCycle(queue, handler, {
      batchSize: 1,
      visibilityTimeoutSeconds: 30,
    });

    expect(result).toEqual({
      alreadyProcessed: 0,
      dispatched: 1,
      failed: 1,
      processed: 0,
      received: 1,
    });
    expect(JSON.stringify(result)).not.toContain("password");
  });
});
