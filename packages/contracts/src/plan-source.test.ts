import { describe, expect, it } from "vitest";

import { planSourceSchema, planSourceStateSchema } from "./plan-source.js";

describe("plan source contracts", () => {
  it("accepts exactly the four approved paths", () => {
    expect(
      ["daygym_suggestion", "official_xlsx", "manual", "professional"].map(
        (source) => planSourceSchema.parse(source),
      ),
    ).toHaveLength(4);
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
