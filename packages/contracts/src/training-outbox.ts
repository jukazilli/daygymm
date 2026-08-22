import { z } from "zod";

import {
  practicalTrainingStateSchema,
  setCompletionInputSchema,
  setRevisionInputSchema,
  exerciseSubstitutionInputSchema,
  trainingCompletionStatusSchema,
  type PracticalTrainingState,
} from "./training-session.js";

export const trainingOutboxTimestampSchema = z.string().datetime({
  offset: true,
});

const operationBaseSchema = z.object({
  attempts: z.number().int().nonnegative(),
  createdAt: trainingOutboxTimestampSchema,
  operationId: z.string().min(16).max(128),
  retryAt: trainingOutboxTimestampSchema,
  sequence: z.number().int().nonnegative(),
  status: z.enum(["conflict", "pending"]),
});

const timedRunInputSchema = z
  .object({
    occurredAt: trainingOutboxTimestampSchema,
    runId: z.string().uuid(),
  })
  .strict();

const finishRunInputSchema = timedRunInputSchema.extend({
  completionStatus: trainingCompletionStatusSchema.optional(),
});

export const queuedTrainingOperationSchema = z.discriminatedUnion("kind", [
  operationBaseSchema.extend({
    input: exerciseSubstitutionInputSchema.extend({
      substitutedAt: trainingOutboxTimestampSchema,
    }),
    kind: z.literal("substitute-exercise"),
  }),
  operationBaseSchema.extend({
    input: z
      .object({
        plannedSessionId: z.string().uuid(),
        runId: z.string().uuid(),
        startedAt: trainingOutboxTimestampSchema,
      })
      .strict(),
    kind: z.literal("start-session"),
  }),
  operationBaseSchema.extend({
    input: z
      .object({
        itemId: z.string().uuid(),
        runId: z.string().uuid(),
        startedAt: trainingOutboxTimestampSchema,
      })
      .strict(),
    kind: z.literal("start-exercise"),
  }),
  operationBaseSchema.extend({
    input: setCompletionInputSchema,
    kind: z.literal("complete-set"),
  }),
  operationBaseSchema.extend({
    changedAt: trainingOutboxTimestampSchema,
    input: setRevisionInputSchema,
    kind: z.literal("revise-set"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("pause-session"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("resume-session"),
  }),
  operationBaseSchema.extend({
    input: timedRunInputSchema,
    kind: z.literal("cancel-session"),
  }),
  operationBaseSchema.extend({
    input: finishRunInputSchema,
    kind: z.literal("finish-session"),
  }),
]);

export type QueuedTrainingOperation = z.infer<
  typeof queuedTrainingOperationSchema
>;

export interface TrainingSessionLocalStore {
  confirmOperation(
    ownerId: string,
    operationId: string,
    state: PracticalTrainingState,
    replacements?: readonly QueuedTrainingOperation[],
  ): Promise<void>;
  enqueueOperation(
    ownerId: string,
    operation: QueuedTrainingOperation,
    state: PracticalTrainingState,
  ): Promise<void>;
  listOperations(ownerId: string): Promise<QueuedTrainingOperation[]>;
  markConflict(ownerId: string, operationId: string): Promise<void>;
  markPending(ownerId: string, operationId: string): Promise<void>;
  markRetry(
    ownerId: string,
    operationId: string,
    attempts: number,
    retryAt: string,
  ): Promise<void>;
  readSnapshot(ownerId: string): Promise<PracticalTrainingState | null>;
  replaceWithCanonical(
    ownerId: string,
    state: PracticalTrainingState,
  ): Promise<void>;
  saveSnapshot(ownerId: string, state: PracticalTrainingState): Promise<void>;
}

export { practicalTrainingStateSchema };
export type { PracticalTrainingState };
