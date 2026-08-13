import { domainEventV1Schema, type DomainEventV1 } from "@daygym/contracts";

const queueMessageIdPattern = /^[1-9][0-9]*$/;

export type DomainEventHandlingOutcome = "already-processed" | "processed";

export type DomainEventQueueMessage = {
  messageId: string;
  payload: unknown;
};

export type IdempotentDomainEventHandler = {
  /**
   * Applies the event at most once for this consumer.
   *
   * Implementations own the durable idempotency key and must commit it in the
   * same transaction as any local state change. A replay returns
   * `already-processed` without applying the effect again.
   */
  handleOnce(event: DomainEventV1): Promise<DomainEventHandlingOutcome>;
};

export type DomainEventQueue = {
  archive(messageId: string): Promise<void>;
};

export type DomainEventConsumptionResult = {
  eventId: string;
  eventName: DomainEventV1["event_name"];
  outcome: DomainEventHandlingOutcome;
};

export type DomainEventConsumerErrorCode =
  | "event.invalid"
  | "event.processing_failed"
  | "queue.archive_failed"
  | "queue.message.invalid";

export class DomainEventConsumerError extends Error {
  readonly code: DomainEventConsumerErrorCode;

  constructor(code: DomainEventConsumerErrorCode) {
    super(code);
    this.name = "DomainEventConsumerError";
    this.code = code;
  }
}

export async function consumeDomainEventMessage(
  message: DomainEventQueueMessage,
  handler: IdempotentDomainEventHandler,
  queue: DomainEventQueue,
): Promise<DomainEventConsumptionResult> {
  if (!queueMessageIdPattern.test(message.messageId)) {
    throw new DomainEventConsumerError("queue.message.invalid");
  }

  const parsedEvent = domainEventV1Schema.safeParse(message.payload);
  if (!parsedEvent.success) {
    throw new DomainEventConsumerError("event.invalid");
  }

  let outcome: DomainEventHandlingOutcome;
  try {
    outcome = await handler.handleOnce(parsedEvent.data);
  } catch {
    throw new DomainEventConsumerError("event.processing_failed");
  }

  try {
    await queue.archive(message.messageId);
  } catch {
    throw new DomainEventConsumerError("queue.archive_failed");
  }

  return {
    eventId: parsedEvent.data.event_id,
    eventName: parsedEvent.data.event_name,
    outcome,
  };
}
