import { z } from "zod";

import {
  importedTrainingPlanSchema,
  trainingModalitySchema,
} from "./training-plan-import.js";

const uuidSchema = z.string().uuid();

export const practicalTrainingExerciseSchema = z
  .object({
    circuitGroup: z.string().min(1).max(40).nullable(),
    completedAt: z.string().datetime().nullable(),
    distanceMeters: z.number().int().min(1).max(100_000).nullable(),
    durationSeconds: z.number().int().min(1).max(7_200).nullable(),
    exerciseName: z.string().min(1).max(120),
    itemId: uuidSchema,
    modality: trainingModalitySchema,
    notes: z.string().max(500).nullable(),
    order: z.number().int().min(1).max(100),
    repsMax: z.number().int().min(1).max(1_000).nullable(),
    repsMin: z.number().int().min(1).max(1_000).nullable(),
    restSeconds: z.number().int().min(0).max(1_800),
    sets: z.number().int().min(1).max(20),
  })
  .strict();

export const practicalTrainingPlanSessionSchema = z
  .object({
    dayOrder: z.number().int().min(1).max(14),
    items: z.array(practicalTrainingExerciseSchema).min(1).max(100),
    name: z.string().min(1).max(80),
    sessionId: uuidSchema,
  })
  .strict();

export const activeTrainingRunSchema = z
  .object({
    runId: uuidSchema,
    session: practicalTrainingPlanSessionSchema,
    startedAt: z.string().datetime(),
  })
  .strict();

export const practicalTrainingStateSchema = z
  .object({
    activeRun: activeTrainingRunSchema.nullable(),
    lastCompletedAt: z.string().datetime().nullable(),
    nextSession: practicalTrainingPlanSessionSchema.nullable(),
    plan: importedTrainingPlanSchema.nullable(),
    sessions: z.array(practicalTrainingPlanSessionSchema).max(14),
  })
  .strict();

export const exerciseCompletionSchema = z
  .object({
    completedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
    wasCreated: z.boolean(),
  })
  .strict();

export const completedTrainingSessionSchema = z
  .object({
    completedAt: z.string().datetime(),
    durationSeconds: z.number().int().nonnegative(),
    sessionId: uuidSchema,
    wasCreated: z.boolean(),
  })
  .strict();

export type PracticalTrainingExercise = z.infer<
  typeof practicalTrainingExerciseSchema
>;
export type PracticalTrainingPlanSession = z.infer<
  typeof practicalTrainingPlanSessionSchema
>;
export type ActiveTrainingRun = z.infer<typeof activeTrainingRunSchema>;
export type PracticalTrainingState = z.infer<
  typeof practicalTrainingStateSchema
>;
export type ExerciseCompletion = z.infer<typeof exerciseCompletionSchema>;
export type CompletedTrainingSession = z.infer<
  typeof completedTrainingSessionSchema
>;

export type TrainingSessionFailure =
  "configuration" | "conflict" | "invalid" | "session" | "unexpected";
export type TrainingSessionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: TrainingSessionFailure };

export interface TrainingSessionGateway {
  completeExercise(
    runId: string,
    itemId: string,
  ): Promise<TrainingSessionResult<ExerciseCompletion>>;
  finish(
    runId: string,
  ): Promise<TrainingSessionResult<CompletedTrainingSession>>;
  load(): Promise<TrainingSessionResult<PracticalTrainingState>>;
  start(
    plannedSessionId: string,
  ): Promise<TrainingSessionResult<ActiveTrainingRun>>;
}
