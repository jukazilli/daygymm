import { describe, expect, it } from "vitest";

import {
  apiMetaV1Schema,
  dayGymOpenApiV1,
  domainEventV1Schema,
  idempotencyKeySchema,
  paginationRequestSchema,
  parseDomainEventV1,
  problemDetailsSchema,
  serializeDomainEventV1,
  toOpaqueId,
} from "./index.js";

describe("opaque identifiers", () => {
  it("normalizes the transport representation", () => {
    expect(toOpaqueId("  synthetic-id  ")).toBe("synthetic-id");
  });

  it("does not permit empty identifiers", () => {
    expect(() => toOpaqueId("  ")).toThrow("cannot be empty");
  });
});

describe("HTTP v1 contracts", () => {
  it("validates the same API metadata shape used by producer and consumers", () => {
    expect(
      apiMetaV1Schema.parse({
        api_version: "v1",
        compatibility: "additive",
        status: "available",
      }),
    ).toEqual({
      api_version: "v1",
      compatibility: "additive",
      status: "available",
    });
    expect(dayGymOpenApiV1.openapi).toBe("3.1.0");
    expect(dayGymOpenApiV1.paths["/v1"]).toBeDefined();
  });

  it("rejects unbounded pagination and short idempotency keys", () => {
    expect(() => paginationRequestSchema.parse({ limit: 101 })).toThrow();
    expect(() => idempotencyKeySchema.parse("short")).toThrow();
  });

  it("accepts only safe Problem Details extensions", () => {
    const problem = {
      type: "urn:daygym:problem:invalid-request",
      title: "Solicitação inválida.",
      status: 400,
      code: "request.invalid",
      correlation_id: "019c6f2a-40fd-7000-8000-000000000001",
      errors: [{ pointer: "/body", code: "request.invalid" }],
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
    expect(() =>
      problemDetailsSchema.parse({ ...problem, stack: "internal" }),
    ).toThrow();
  });
});

describe("internal event v1 contracts", () => {
  const envelope = {
    event_id: "019c6f2a-40fd-7000-8000-000000000001",
    event_version: 1,
    occurred_at: "2026-08-13T06:00:00.000Z",
    correlation_id: "019c6f2a-40fd-7000-8000-000000000002",
    producer: "training",
  } as const;

  it("validates an approved event with a minimal payload", () => {
    const event = {
      ...envelope,
      event_name: "TrainingSessionCompleted",
      payload: {
        session_id: "session-01",
        user_id: "user-01",
        occurred_at: "2026-08-13T06:00:00.000Z",
        version: 1,
      },
    } as const;

    const serializedByProducer = serializeDomainEventV1(event);
    expect(parseDomainEventV1(serializedByProducer)).toEqual(event);
  });

  it("distinguishes a partial training completion from a complete one", () => {
    expect(
      domainEventV1Schema.parse({
        ...envelope,
        event_name: "TrainingSessionPartiallyCompleted",
        payload: {
          session_id: "session-01",
          user_id: "user-01",
          occurred_at: "2026-08-13T06:00:00.000Z",
          version: 1,
        },
      }).event_name,
    ).toBe("TrainingSessionPartiallyCompleted");
  });

  it("rejects an unknown version and undeclared payload data", () => {
    expect(() =>
      domainEventV1Schema.parse({
        ...envelope,
        event_version: 2,
        event_name: "RewardGranted",
        payload: {
          ledger_entry_id: "ledger-01",
          reason_code: "training.completed",
          email: "must-not-enter-events@example.invalid",
        },
      }),
    ).toThrow();
  });
});
