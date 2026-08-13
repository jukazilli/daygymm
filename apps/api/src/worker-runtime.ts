import {
  runDomainEventWorkerCycle,
  type DomainEventWorkerCycleResult,
} from "./domain-event-worker.js";
import { WorkerDomainEventHandler } from "./worker-domain-event-handler.js";
import {
  createPostgresWorkerQueueDatabase,
  readWorkerDatabaseUrl,
  WorkerDomainEventQueue,
} from "./worker-queue.js";

const workerBatchSize = 10;
const workerVisibilityTimeoutSeconds = 30;

export async function runConfiguredDomainEventWorkerCycle(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DomainEventWorkerCycleResult> {
  const databaseUrl = readWorkerDatabaseUrl(environment);
  const database = createPostgresWorkerQueueDatabase(databaseUrl);
  const queue = new WorkerDomainEventQueue(database);
  const handler = new WorkerDomainEventHandler(database);

  try {
    return await runDomainEventWorkerCycle(queue, handler, {
      batchSize: workerBatchSize,
      visibilityTimeoutSeconds: workerVisibilityTimeoutSeconds,
    });
  } finally {
    await queue.close();
  }
}
