import { describe, expect, it, vi } from "vitest";

import type { DomainEventV1 } from "@daygym/contracts";

import {
  consumeDomainEventMessage,
  DomainEventConsumerError,
  type DomainEventHandlingOutcome,
} from "./domain-event-consumer.js";

const event: DomainEventV1 = {
  event_id: "019c6f2a-40fd-7000-8000-000000000001",
  event_name: "TrainingSessionCompleted",
  event_version: 1,
  occurred_at: "2026-08-13T12:00:00.000Z",
  correlation_id: "019c6f2a-40fd-7000-8000-000000000002",
  producer: "training-api",
  payload: {
    session_id: "session:001",
    user_id: "user:001",
    occurred_at: "2026-08-13T11:55:00.000Z",
    version: 1,
  },
};

function buildDependencies(
  outcomes: DomainEventHandlingOutcome[] = ["processed"],
) {
  const handleOnce = vi.fn(async () => outcomes.shift() ?? "already-processed");
  const archive = vi.fn(async () => undefined);

  return {
    handler: { handleOnce },
    queue: { archive },
    handleOnce,
    archive,
  };
}

describe("domain event consumer contract", () => {
  it("archives only after a successful idempotent handler", async () => {
    const calls: string[] = [];
    const handler = {
      handleOnce: vi.fn(async () => {
        calls.push("handle");
        return "processed" as const;
      }),
    };
    const queue = {
      archive: vi.fn(async () => {
        calls.push("archive");
      }),
    };

    await expect(
      consumeDomainEventMessage(
        { messageId: "42", payload: event },
        handler,
        queue,
      ),
    ).resolves.toEqual({
      eventId: event.event_id,
      eventName: event.event_name,
      outcome: "processed",
    });
    expect(calls).toEqual(["handle", "archive"]);
  });

  it("archives a replay after the handler confirms it was already processed", async () => {
    const dependencies = buildDependencies(["already-processed"]);

    await expect(
      consumeDomainEventMessage(
        { messageId: "43", payload: event },
        dependencies.handler,
        dependencies.queue,
      ),
    ).resolves.toMatchObject({ outcome: "already-processed" });
    expect(dependencies.handleOnce).toHaveBeenCalledOnce();
    expect(dependencies.archive).toHaveBeenCalledWith("43");
  });

  it("does not archive when event processing fails", async () => {
    const dependencies = buildDependencies();
    dependencies.handleOnce.mockRejectedValueOnce(
      new Error("customer email and private payload"),
    );

    await expect(
      consumeDomainEventMessage(
        { messageId: "44", payload: event },
        dependencies.handler,
        dependencies.queue,
      ),
    ).rejects.toMatchObject({ code: "event.processing_failed" });
    expect(dependencies.archive).not.toHaveBeenCalled();
  });

  it("allows a safe replay after archive fails without repeating the effect", async () => {
    const dependencies = buildDependencies(["processed", "already-processed"]);
    dependencies.archive.mockRejectedValueOnce(new Error("queue credentials"));

    await expect(
      consumeDomainEventMessage(
        { messageId: "45", payload: event },
        dependencies.handler,
        dependencies.queue,
      ),
    ).rejects.toMatchObject({ code: "queue.archive_failed" });

    await expect(
      consumeDomainEventMessage(
        { messageId: "45", payload: event },
        dependencies.handler,
        dependencies.queue,
      ),
    ).resolves.toMatchObject({ outcome: "already-processed" });
    expect(dependencies.handleOnce).toHaveBeenCalledTimes(2);
    expect(dependencies.archive).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid envelope without exposing its payload", async () => {
    const dependencies = buildDependencies();
    const privateValue = "person@example.com bearer-secret";

    const rejection = consumeDomainEventMessage(
      {
        messageId: "46",
        payload: { ...event, unexpected: privateValue },
      },
      dependencies.handler,
      dependencies.queue,
    );

    await expect(rejection).rejects.toEqual(
      new DomainEventConsumerError("event.invalid"),
    );
    await rejection.catch((error: unknown) => {
      expect(JSON.stringify(error)).not.toContain(privateValue);
      expect(String(error)).not.toContain(privateValue);
    });
    expect(dependencies.handleOnce).not.toHaveBeenCalled();
    expect(dependencies.archive).not.toHaveBeenCalled();
  });

  it("rejects an unsafe queue identifier before processing", async () => {
    const dependencies = buildDependencies();

    await expect(
      consumeDomainEventMessage(
        { messageId: "47 token=secret", payload: event },
        dependencies.handler,
        dependencies.queue,
      ),
    ).rejects.toMatchObject({ code: "queue.message.invalid" });
    expect(dependencies.handleOnce).not.toHaveBeenCalled();
    expect(dependencies.archive).not.toHaveBeenCalled();
  });
});
