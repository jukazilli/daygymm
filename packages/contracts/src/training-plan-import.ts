import { z } from "zod";

import { idempotencyKeySchema } from "./http.js";

export const trainingModalities = [
  "strength",
  "time",
  "distance",
  "cardio",
  "circuit",
] as const;

export const trainingModalitySchema = z.enum(trainingModalities);
export type TrainingModality = z.infer<typeof trainingModalitySchema>;

export const officialXlsxPlanItemSchema = z
  .object({
    circuitGroup: z.string().trim().min(1).max(40).nullable(),
    distanceMeters: z.number().int().min(1).max(100_000).nullable(),
    durationSeconds: z.number().int().min(1).max(7_200).nullable(),
    exerciseName: z.string().trim().min(1).max(120),
    modality: trainingModalitySchema,
    notes: z.string().trim().max(500).nullable(),
    order: z.number().int().min(1).max(100),
    repsMax: z.number().int().min(1).max(1_000).nullable(),
    repsMin: z.number().int().min(1).max(1_000).nullable(),
    restSeconds: z.number().int().min(0).max(1_800),
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
  });

export const officialXlsxPlanSessionSchema = z
  .object({
    dayOrder: z.number().int().min(1).max(14),
    items: z.array(officialXlsxPlanItemSchema).min(1).max(100),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const officialXlsxPlanProposalSchema = z
  .object({
    operationId: idempotencyKeySchema,
    planName: z.string().trim().min(1).max(80),
    sessions: z.array(officialXlsxPlanSessionSchema).min(1).max(14),
    sourceFileName: z.string().trim().min(6).max(120).endsWith(".xlsx"),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceSizeBytes: z.number().int().min(1).max(2_097_152),
  })
  .strict()
  .superRefine((proposal, issue) => {
    const totalItems = proposal.sessions.reduce(
      (total, session) => total + session.items.length,
      0,
    );
    if (totalItems > 300) {
      issue.addIssue({
        code: "custom",
        message: "An imported plan can contain at most 300 items.",
        path: ["sessions"],
      });
    }

    const dayOrders = new Set(
      proposal.sessions.map((session) => session.dayOrder),
    );
    if (dayOrders.size !== proposal.sessions.length) {
      issue.addIssue({
        code: "custom",
        message: "Each imported session requires a unique day order.",
        path: ["sessions"],
      });
    }
  });

export const importedTrainingPlanSchema = z
  .object({
    itemCount: z.number().int().min(1).max(300),
    name: z.string().min(1).max(80),
    planId: z.string().uuid(),
    sessionCount: z.number().int().min(1).max(14),
    version: z.number().int().positive(),
    versionId: z.string().uuid(),
    wasCreated: z.boolean(),
  })
  .strict();

export type OfficialXlsxPlanItem = z.infer<typeof officialXlsxPlanItemSchema>;
export type OfficialXlsxPlanSession = z.infer<
  typeof officialXlsxPlanSessionSchema
>;
export type OfficialXlsxPlanProposal = z.infer<
  typeof officialXlsxPlanProposalSchema
>;
export type ImportedTrainingPlan = z.infer<typeof importedTrainingPlanSchema>;

export type TrainingPlanFailure =
  "configuration" | "invalid" | "session" | "unexpected";
export type TrainingPlanResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: TrainingPlanFailure };

export interface TrainingPlanGateway {
  importOfficialXlsx(
    proposal: OfficialXlsxPlanProposal,
  ): Promise<TrainingPlanResult<ImportedTrainingPlan>>;
  loadActive(): Promise<TrainingPlanResult<ImportedTrainingPlan | null>>;
}
