import { z } from "zod";

import { idempotencyKeySchema } from "./http.js";
import { trainingModalitySchema } from "./training-plan-import.js";
import type {
  ImportedTrainingPlan,
  TrainingPlanResult,
} from "./training-plan-import.js";

const uuidSchema = z.string().uuid();
const databaseTimestampSchema = z.string().datetime({ offset: true });
const optionalInteger = (maximum: number) =>
  z.number().int().min(1).max(maximum).nullable();
const optionalWeightSchema = z
  .number()
  .min(0.25)
  .max(2_000)
  .multipleOf(0.01)
  .nullable();

export const trainingLoadModeSchema = z.enum([
  "unconfigured",
  "external",
  "none",
]);

export const trainingPlanDraftItemSchema = z
  .object({
    circuitGroup: z.string().trim().min(1).max(40).nullable(),
    distanceMeters: optionalInteger(100_000),
    durationSeconds: optionalInteger(7_200),
    exerciseName: z.string().trim().min(1).max(120),
    itemId: uuidSchema,
    loadIncrementKg: z
      .number()
      .min(0.01)
      .max(2_000)
      .multipleOf(0.01)
      .nullable(),
    loadMode: trainingLoadModeSchema,
    modality: trainingModalitySchema,
    notes: z.string().trim().max(500).nullable(),
    order: z.number().int().min(1).max(100),
    plannedWeightKg: optionalWeightSchema,
    repsMax: optionalInteger(1_000),
    repsMin: optionalInteger(1_000),
    restSeconds: z.number().int().min(0).max(1_800),
    setProgressionKg: z.number().min(0).max(2_000).multipleOf(0.01).nullable(),
    sets: z.number().int().min(1).max(20),
  })
  .strict()
  .superRefine((item, issue) => {
    if (
      item.repsMin !== null &&
      item.repsMax !== null &&
      item.repsMax < item.repsMin
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "Maximum repetitions cannot be lower than minimum repetitions.",
        path: ["repsMax"],
      });
    }
    if (
      item.modality === "strength" &&
      (item.repsMin === null || item.repsMax === null)
    ) {
      issue.addIssue({
        code: "custom",
        message: "Strength items require a repetition range.",
        path: ["repsMin"],
      });
    }
    if (item.modality === "time" && item.durationSeconds === null) {
      issue.addIssue({
        code: "custom",
        message: "Time items require duration.",
        path: ["durationSeconds"],
      });
    }
    if (
      (item.modality === "distance" || item.modality === "cardio") &&
      item.distanceMeters === null &&
      item.durationSeconds === null
    ) {
      issue.addIssue({
        code: "custom",
        message: "Distance and cardio items require distance or duration.",
        path: ["distanceMeters"],
      });
    }
    if (item.modality === "circuit" && item.circuitGroup === null) {
      issue.addIssue({
        code: "custom",
        message: "Circuit items require a group.",
        path: ["circuitGroup"],
      });
    }
    if (item.modality !== "strength") {
      if (
        item.loadMode !== "none" ||
        item.plannedWeightKg !== null ||
        item.loadIncrementKg !== null ||
        item.setProgressionKg !== null
      ) {
        issue.addIssue({
          code: "custom",
          message: "Only strength items can configure external load.",
          path: ["loadMode"],
        });
      }
      return;
    }
    if (
      item.loadMode === "external" &&
      (item.plannedWeightKg === null ||
        item.loadIncrementKg === null ||
        item.setProgressionKg === null)
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "External load requires an initial load, set progression, and session step.",
        path: ["loadMode"],
      });
    }
    if (
      item.loadMode === "external" &&
      item.plannedWeightKg !== null &&
      item.setProgressionKg !== null &&
      item.plannedWeightKg + item.setProgressionKg * (item.sets - 1) > 2_000
    ) {
      issue.addIssue({
        code: "custom",
        message: "The last suggested set load cannot exceed 2000 kg.",
        path: ["setProgressionKg"],
      });
    }
    if (
      item.loadMode === "none" &&
      (item.plannedWeightKg !== null ||
        item.loadIncrementKg !== null ||
        item.setProgressionKg !== null)
    ) {
      issue.addIssue({
        code: "custom",
        message: "Exercises without external load cannot keep load values.",
        path: ["loadMode"],
      });
    }
    if (
      item.loadMode === "unconfigured" &&
      (item.loadIncrementKg !== null || item.setProgressionKg !== null)
    ) {
      issue.addIssue({
        code: "custom",
        message: "An unconfigured load cannot keep progression values.",
        path: ["loadIncrementKg"],
      });
    }
  });

export const trainingPlanDraftSessionSchema = z
  .object({
    dayOrder: z.number().int().min(1).max(14),
    items: z.array(trainingPlanDraftItemSchema).min(1).max(100),
    name: z.string().trim().min(1).max(80),
    sessionId: uuidSchema,
  })
  .strict();

function validatePlanSessions(
  sessions: readonly z.infer<typeof trainingPlanDraftSessionSchema>[],
  issue: z.RefinementCtx,
) {
  const dayOrders = new Set(sessions.map((session) => session.dayOrder));
  if (dayOrders.size !== sessions.length) {
    issue.addIssue({
      code: "custom",
      message: "Each training session requires a unique weekly slot.",
      path: ["sessions"],
    });
  }
  const totalItems = sessions.reduce(
    (total, session) => total + session.items.length,
    0,
  );
  if (totalItems > 300) {
    issue.addIssue({
      code: "custom",
      message: "A training plan can contain at most 300 items.",
      path: ["sessions"],
    });
  }
}

export const trainingPlanDraftSchema = z
  .object({
    currentVersion: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(80),
    planId: uuidSchema.nullable(),
    sessions: z.array(trainingPlanDraftSessionSchema).min(1).max(14),
  })
  .strict()
  .superRefine((draft, issue) => {
    validatePlanSessions(draft.sessions, issue);
  });

export const publishTrainingPlanInputSchema = z
  .object({
    changeSummary: z.string().trim().min(1).max(240),
    name: z.string().trim().min(1).max(80),
    operationId: idempotencyKeySchema,
    planId: uuidSchema.nullable(),
    sessions: z.array(trainingPlanDraftSessionSchema).min(1).max(14),
  })
  .strict()
  .superRefine((input, issue) => {
    validatePlanSessions(input.sessions, issue);
  });

export const trainingPlanSummarySchema = z
  .object({
    archivedAt: databaseTimestampSchema.nullable(),
    currentVersion: z.number().int().positive(),
    itemCount: z.number().int().min(0),
    name: z.string().trim().min(1).max(80),
    planId: uuidSchema,
    provenance: z.enum(["manual", "official_xlsx"]),
    sessionCount: z.number().int().min(0),
    updatedAt: databaseTimestampSchema,
  })
  .strict();

export interface TrainingPlanArchiveResult {
  readonly archivedAt: string;
  readonly planId: string;
  readonly wasChanged: boolean;
}

export interface TrainingPlanRestoreResult {
  readonly planId: string;
  readonly wasChanged: boolean;
}

export type TrainingLoadMode = z.infer<typeof trainingLoadModeSchema>;
export type TrainingPlanDraftItem = z.infer<typeof trainingPlanDraftItemSchema>;
export type TrainingPlanDraftSession = z.infer<
  typeof trainingPlanDraftSessionSchema
>;
export type TrainingPlanDraft = z.infer<typeof trainingPlanDraftSchema>;
export type PublishTrainingPlanInput = z.infer<
  typeof publishTrainingPlanInputSchema
>;
export type TrainingPlanSummary = z.infer<typeof trainingPlanSummarySchema>;

export interface TrainingPlanEditorGateway {
  archive(
    planId: string,
  ): Promise<TrainingPlanResult<TrainingPlanArchiveResult>>;
  list(): Promise<TrainingPlanResult<readonly TrainingPlanSummary[]>>;
  load(planId?: string): Promise<TrainingPlanResult<TrainingPlanDraft | null>>;
  publish(
    input: PublishTrainingPlanInput,
  ): Promise<TrainingPlanResult<ImportedTrainingPlan>>;
  restore(
    planId: string,
  ): Promise<TrainingPlanResult<TrainingPlanRestoreResult>>;
}
