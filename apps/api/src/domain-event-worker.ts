import {
  consumeDomainEventMessage,
  type DomainEventQueue,
  type DomainEventQueueMessage,
  type IdempotentDomainEventHandler,
} from "./domain-event-consumer.js";

export type DomainEventWorkerQueue = DomainEventQueue & {
  dispatch(batchSize: number): Promise<number>;
  read(
    visibilityTimeoutSeconds: number,
    batchSize: number,
  ): Promise<DomainEventQueueMessage[]>;
};

export type DomainEventWorkerCycleResult = {
  alreadyProcessed: number;
  dispatched: number;
  failed: number;
  processed: number;
  received: number;
};

export async function runDomainEventWorkerCycle(
  queue: DomainEventWorkerQueue,
  handler: IdempotentDomainEventHandler,
  options: {
    batchSize: number;
    visibilityTimeoutSeconds: number;
  },
): Promise<DomainEventWorkerCycleResult> {
  const dispatched = await queue.dispatch(options.batchSize);
  const messages = await queue.read(
    options.visibilityTimeoutSeconds,
    options.batchSize,
  );
  const result: DomainEventWorkerCycleResult = {
    alreadyProcessed: 0,
    dispatched,
    failed: 0,
    processed: 0,
    received: messages.length,
  };

  for (const message of messages) {
    try {
      const consumption = await consumeDomainEventMessage(
        message,
        handler,
        queue,
      );
      if (consumption.outcome === "processed") {
        result.processed += 1;
      } else {
        result.alreadyProcessed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
