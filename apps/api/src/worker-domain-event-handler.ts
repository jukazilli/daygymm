import type { DomainEventV1 } from "@daygym/contracts";

import type {
  DomainEventHandlingOutcome,
  IdempotentDomainEventHandler,
} from "./domain-event-consumer.js";
import type { WorkerQueueDatabase } from "./worker-queue.js";

export type WorkerHandlerErrorCode =
  "database.response.invalid" | "event.handler.unavailable";

export class WorkerHandlerError extends Error {
  readonly code: WorkerHandlerErrorCode;

  constructor(code: WorkerHandlerErrorCode) {
    super(code);
    this.name = "WorkerHandlerError";
    this.code = code;
  }
}

export class WorkerDomainEventHandler implements IdempotentDomainEventHandler {
  constructor(private readonly database: Pick<WorkerQueueDatabase, "handle">) {}

  async handleOnce(event: DomainEventV1): Promise<DomainEventHandlingOutcome> {
    let result: unknown;
    try {
      result = await this.database.handle(event);
    } catch {
      throw new WorkerHandlerError("event.handler.unavailable");
    }

    const outcome = readOutcome(result);
    if (outcome !== "processed" && outcome !== "already-processed") {
      throw new WorkerHandlerError("database.response.invalid");
    }

    return outcome;
  }
}

function readOutcome(result: unknown): unknown {
  if (
    !Array.isArray(result) ||
    result.length !== 1 ||
    typeof result[0] !== "object" ||
    result[0] === null
  ) {
    throw new WorkerHandlerError("database.response.invalid");
  }

  return (result[0] as Record<string, unknown>).outcome;
}
