import { z } from "zod";

export const planSources = ["official_xlsx", "manual", "professional"] as const;

export const planSourceSchema = z.enum(planSources);
export type PlanSource = z.infer<typeof planSourceSchema>;

export const planSourceStateSchema = z
  .object({
    onboardingCompleted: z.boolean(),
    selectedAt: z.string().datetime({ offset: true }).nullable(),
    source: planSourceSchema.nullable(),
  })
  .superRefine((state, issue) => {
    if ((state.source === null) !== (state.selectedAt === null)) {
      issue.addIssue({
        code: "custom",
        message: "Plan source and selection time must change together.",
        path: ["source"],
      });
    }

    if (!state.onboardingCompleted && state.source !== null) {
      issue.addIssue({
        code: "custom",
        message: "A plan source requires a completed onboarding context.",
        path: ["onboardingCompleted"],
      });
    }
  });

export type PlanSourceState = z.infer<typeof planSourceStateSchema>;
export type PlanSourceFailure = "configuration" | "session" | "unexpected";
export type PlanSourceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: PlanSourceFailure };

export interface PlanSourceGateway {
  load(): Promise<PlanSourceResult<PlanSourceState>>;
  select(source: PlanSource): Promise<PlanSourceResult<PlanSourceState>>;
}
