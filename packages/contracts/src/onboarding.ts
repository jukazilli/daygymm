import { z } from "zod";

export const onboardingGoals = [
  "fat_loss",
  "hypertrophy",
  "strength",
  "conditioning",
  "health_return",
] as const;

export const onboardingExperienceLevels = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const onboardingSessionDurations = [30, 45, 60, 75] as const;

export const onboardingEquipmentContexts = [
  "full_gym",
  "limited_gym",
  "home_equipment",
  "bodyweight",
] as const;

export const onboardingLimitationStatuses = [
  "none",
  "not_informed",
  "needs_professional_review",
] as const;

export type OnboardingGoal = (typeof onboardingGoals)[number];
export type OnboardingExperience = (typeof onboardingExperienceLevels)[number];
export type OnboardingSessionDuration =
  (typeof onboardingSessionDurations)[number];
export type OnboardingEquipmentContext =
  (typeof onboardingEquipmentContexts)[number];
export type OnboardingLimitationStatus =
  (typeof onboardingLimitationStatuses)[number];
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const onboardingContextSchema = z
  .object({
    goal: z.enum(onboardingGoals).nullable(),
    experience: z.enum(onboardingExperienceLevels).nullable(),
    weeklyDays: z.number().int().min(2).max(5).nullable(),
    sessionMinutes: z
      .number()
      .int()
      .refine(
        (value) =>
          onboardingSessionDurations.includes(
            value as OnboardingSessionDuration,
          ),
        "Unsupported session duration.",
      )
      .nullable(),
    equipmentContext: z.enum(onboardingEquipmentContexts).nullable(),
    limitationStatus: z.enum(onboardingLimitationStatuses).nullable(),
    currentStep: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    completedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .superRefine((context, issue) => {
    const requiredAnswers = [
      context.goal,
      context.experience,
      context.weeklyDays,
      context.sessionMinutes,
      context.equipmentContext,
      context.limitationStatus,
    ];

    for (let step = 1; step <= context.currentStep; step += 1) {
      if (requiredAnswers[step - 1] === null) {
        issue.addIssue({
          code: "custom",
          message: "Onboarding progress is inconsistent with its answers.",
          path: ["currentStep"],
        });
        break;
      }
    }

    if (context.completedAt && context.currentStep !== 6) {
      issue.addIssue({
        code: "custom",
        message: "Only a reviewed onboarding context can be completed.",
        path: ["completedAt"],
      });
    }
  });

export type OnboardingContext = z.infer<typeof onboardingContextSchema>;

export type SaveOnboardingContextInput = Omit<
  OnboardingContext,
  "completedAt"
> & {
  readonly confirmed: boolean;
};

export type OnboardingFailure = "configuration" | "session" | "unexpected";

export type OnboardingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: OnboardingFailure };

export interface OnboardingGateway {
  load(): Promise<OnboardingResult<OnboardingContext>>;
  save(
    input: SaveOnboardingContextInput,
  ): Promise<OnboardingResult<OnboardingContext>>;
}
