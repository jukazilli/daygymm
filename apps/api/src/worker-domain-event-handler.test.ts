import { describe, expect, it, vi } from "vitest";

import type { DomainEventV1 } from "@daygym/contracts";

import {
  WorkerDomainEventHandler,
  WorkerHandlerError,
} from "./worker-domain-event-handler.js";

const event: DomainEventV1 = {
  event_id: "c1000000-0000-4000-8000-000000000001",
  event_name: "TrainingSessionCompleted",
  event_version: 1,
  occurred_at: "2026-08-13T13:30:00.000Z",
  correlation_id: "c2000000-0000-4000-8000-000000000002",
  producer: "training",
  payload: {
    session_id: "c3000000-0000-4000-8000-000000000003",
    user_id: "c4000000-0000-4000-8000-000000000004",
    occurred_at: "2026-08-13T13:30:00.000Z",
    version: 1,
  },
};

describe("worker domain event handler", () => {
  it.each(["processed", "already-processed"] as const)(
    "returns the durable %s outcome",
    async (outcome) => {
      const database = { handle: vi.fn(async () => [{ outcome }]) };
      const handler = new WorkerDomainEventHandler(database);

      await expect(handler.handleOnce(event)).resolves.toBe(outcome);
      expect(database.handle).toHaveBeenCalledWith(event);
    },
  );

  it("fails closed when the database response is malformed", async () => {
    const handler = new WorkerDomainEventHandler({
      handle: vi.fn(async () => [{ outcome: "ignored" }]),
    });

    await expect(handler.handleOnce(event)).rejects.toEqual(
      new WorkerHandlerError("database.response.invalid"),
    );
  });

  it("maps private database failures to a safe stable error", async () => {
    const handler = new WorkerDomainEventHandler({
      handle: vi.fn(async () => {
        throw new Error("postgres://worker:password@example.invalid/database");
      }),
    });

    const rejection = handler.handleOnce(event);
    await expect(rejection).rejects.toEqual(
      new WorkerHandlerError("event.handler.unavailable"),
    );
    await rejection.catch((error: unknown) => {
      expect(JSON.stringify(error)).not.toContain("password");
      expect(JSON.stringify(error)).not.toContain("postgres://");
    });
  });
});
