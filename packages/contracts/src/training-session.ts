import { z } from "zod";

import {
  importedTrainingPlanSchema,
  trainingModalitySchema,
} from "./training-plan-import.js";

const uuidSchema = z.string().uuid();
const optionalWeightSchema = z
  .number()
  .min(0.25)
  .max(2_000)
  .multipleOf(0.01)
  .nullable();
const optionalSetProgressionSchema = z
  .number()
  .min(0)
  .max(2_000)
  .multipleOf(0.01)
  .nullable();

export const practicalTrainingSetSchema = z
  .object({
    actualDistanceMeters: z.number().int().min(1).max(100_000).nullable(),
    actualDurationSeconds: z.number().int().min(1).max(7_200).nullable(),
    actualReps: z.number().int().min(1).max(1_000).nullable(),
    actualWeightKg: optionalWeightSchema,
    completedAt: z.string().datetime({ offset: true }),
    plannedDistanceMeters: z.number().int().min(1).max(100_000).nullable(),
    plannedDurationSeconds: z.number().int().min(1).max(7_200).nullable(),
    plannedRepsMax: z.number().int().min(1).max(1_000).nullable(),
    plannedRepsMin: z.number().int().min(1).max(1_000).nullable(),
    plannedWeightKg: optionalWeightSchema,
    setExecutionId: uuidSchema,
    setNumber: z.number().int().min(1).max(20),
  })
  .strict();

export const practicalTrainingExerciseSchema = z
  .object({
    circuitGroup: z.string().min(1).max(40).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    distanceMeters: z.number().int().min(1).max(100_000).nullable(),
    durationSeconds: z.number().int().min(1).max(7_200).nullable(),
    exerciseName: z.string().min(1).max(120),
    itemId: uuidSchema,
    setProgressionKg: optionalSetProgressionSchema,
    modality: trainingModalitySchema,
    notes: z.string().max(500).nullable(),
    order: z.number().int().min(1).max(100),
    plannedWeightKg: optionalWeightSchema,
    repsMax: z.number().int().min(1).max(1_000).nullable(),
    repsMin: z.number().int().min(1).max(1_000).nullable(),
    restSeconds: z.number().int().min(0).max(1_800),
    sets: z.number().int().min(1).max(20),
    setExecutions: z.array(practicalTrainingSetSchema).max(20),
    startedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const practicalTrainingPlanSessionSchema = z
  .object({
    dayOrder: z.number().int().min(1).max(14),
    items: z.array(practicalTrainingExerciseSchema).min(1).max(100),
    name: z.string().min(1).max(80),
    sessionId: uuidSchema,
    weekday: z.number().int().min(1).max(7),
  })
  .strict();

export const activeTrainingRunSchema = z
  .object({
    pausedAt: z.string().datetime({ offset: true }).nullable(),
    pausedDurationSeconds: z.number().int().nonnegative(),
    runId: uuidSchema,
    session: practicalTrainingPlanSessionSchema,
    startedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const practicalTrainingStateSchema = z
  .object({
    activeRun: activeTrainingRunSchema.nullable(),
    lastCompletedAt: z.string().datetime({ offset: true }).nullable(),
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

export const exerciseStartSchema = z
  .object({
    nextSetNumber: z.number().int().min(1).max(20),
    startedAt: z.string().datetime({ offset: true }),
    totalSets: z.number().int().min(1).max(20),
    wasCreated: z.boolean(),
  })
  .strict();

export const setCompletionInputSchema = z
  .object({
    actualDistanceMeters: z.number().int().min(1).max(100_000).nullable(),
    actualDurationSeconds: z.number().int().min(1).max(7_200).nullable(),
    actualReps: z.number().int().min(1).max(1_000).nullable(),
    actualWeightKg: optionalWeightSchema,
    itemId: uuidSchema,
    runId: uuidSchema,
    setNumber: z.number().int().min(1).max(20),
  })
  .strict()
  .refine(
    (input) =>
      input.actualReps !== null ||
      input.actualDurationSeconds !== null ||
      input.actualDistanceMeters !== null,
    { message: "A completed set requires one performed measure." },
  );

export const setCompletionSchema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    completedSetCount: z.number().int().min(1).max(20),
    exerciseCompleted: z.boolean(),
    setExecutionId: uuidSchema,
    setNumber: z.number().int().min(1).max(20),
    totalSets: z.number().int().min(1).max(20),
    wasCreated: z.boolean(),
  })
  .strict();

export const completedTrainingSessionSchema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    durationSeconds: z.number().int().nonnegative(),
    sessionId: uuidSchema,
    wasCreated: z.boolean(),
  })
  .strict();

export type PracticalTrainingExercise = z.infer<
  typeof practicalTrainingExerciseSchema
>;
export type PracticalTrainingSet = z.infer<typeof practicalTrainingSetSchema>;
export type PracticalTrainingPlanSession = z.infer<
  typeof practicalTrainingPlanSessionSchema
>;
export type ActiveTrainingRun = z.infer<typeof activeTrainingRunSchema>;
export type PracticalTrainingState = z.infer<
  typeof practicalTrainingStateSchema
>;
export type ExerciseCompletion = z.infer<typeof exerciseCompletionSchema>;
export type ExerciseStart = z.infer<typeof exerciseStartSchema>;
export type SetCompletionInput = z.infer<typeof setCompletionInputSchema>;
export type SetCompletion = z.infer<typeof setCompletionSchema>;
export type CompletedTrainingSession = z.infer<
  typeof completedTrainingSessionSchema
>;
export interface CancelledTrainingSession {
  readonly runId: string;
  readonly wasCancelled: boolean;
}

export interface TrainingPauseState {
  readonly pausedAt: string | null;
  readonly pausedDurationSeconds: number;
  readonly runId: string;
  readonly wasChanged: boolean;
}

export type TrainingSessionFailure =
  "configuration" | "conflict" | "invalid" | "session" | "unexpected";
export type TrainingSessionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: TrainingSessionFailure };

export interface TrainingSessionGateway {
  cancel(
    runId: string,
  ): Promise<TrainingSessionResult<CancelledTrainingSession>>;
  completeExercise(
    runId: string,
    itemId: string,
  ): Promise<TrainingSessionResult<ExerciseCompletion>>;
  completeSet(
    input: SetCompletionInput,
  ): Promise<TrainingSessionResult<SetCompletion>>;
  finish(
    runId: string,
  ): Promise<TrainingSessionResult<CompletedTrainingSession>>;
  load(
    preferredSessionId?: string,
  ): Promise<TrainingSessionResult<PracticalTrainingState>>;
  pause(runId: string): Promise<TrainingSessionResult<TrainingPauseState>>;
  resume(runId: string): Promise<TrainingSessionResult<TrainingPauseState>>;
  start(
    plannedSessionId: string,
  ): Promise<TrainingSessionResult<ActiveTrainingRun>>;
  startExercise(
    runId: string,
    itemId: string,
  ): Promise<TrainingSessionResult<ExerciseStart>>;
}
