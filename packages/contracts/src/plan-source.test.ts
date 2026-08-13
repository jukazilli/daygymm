import { describe, expect, it } from "vitest";

import { planSourceSchema, planSourceStateSchema } from "./plan-source.js";

describe("plan source contracts", () => {
  it("accepts exactly the three approved paths", () => {
    expect(
      ["official_xlsx", "manual", "professional"].map((source) =>
        planSourceSchema.parse(source),
      ),
    ).toHaveLength(3);
    expect(() => planSourceSchema.parse("daygym_suggestion")).toThrow();
    expect(() => planSourceSchema.parse("automatic_plan")).toThrow();
  });

  it("keeps selection and server time coherent", () => {
    expect(
      planSourceStateSchema.parse({
        onboardingCompleted: true,
        selectedAt: "2026-08-13T17:00:00.000Z",
        source: "manual",
      }),
    ).toMatchObject({ source: "manual" });

    expect(() =>
      planSourceStateSchema.parse({
        onboardingCompleted: true,
        selectedAt: null,
        source: "manual",
      }),
    ).toThrow();
  });
});
