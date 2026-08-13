import { describe, expect, it } from "vitest";

import { onboardingContextSchema } from "./onboarding.js";

describe("onboardingContextSchema", () => {
  it("accepts a complete minimum training context", () => {
    expect(
      onboardingContextSchema.parse({
        completedAt: "2026-08-13T18:00:00.000Z",
        currentStep: 6,
        equipmentContext: "full_gym",
        experience: "beginner",
        goal: "health_return",
        limitationStatus: "not_informed",
        sessionMinutes: 45,
        weeklyDays: 3,
      }),
    ).toMatchObject({ currentStep: 6, weeklyDays: 3 });
  });

  it("rejects unsupported values received from the data boundary", () => {
    expect(() =>
      onboardingContextSchema.parse({
        completedAt: null,
        currentStep: 1,
        equipmentContext: null,
        experience: null,
        goal: "miracle_result",
        limitationStatus: null,
        sessionMinutes: null,
        weeklyDays: null,
      }),
    ).toThrow();
  });
});
