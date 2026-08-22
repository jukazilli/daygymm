import { describe, expect, it } from "vitest";

import { officialXlsxPlanProposalSchema } from "./training-plan-import.js";

const validProposal = {
  operationId: "plan-import:00000000-0000-4000-8000-000000000001",
  planName: "Treino inicial",
  sessions: [
    {
      dayOrder: 1,
      items: [
        {
          circuitGroup: null,
          distanceMeters: null,
          durationSeconds: null,
          exerciseName: "Agachamento livre",
          modality: "strength",
          notes: null,
          order: 1,
          plannedWeightKg: 40,
          repsMax: 12,
          repsMin: 8,
          restSeconds: 90,
          sets: 3,
        },
      ],
      name: "Treino A",
    },
  ],
  sourceFileName: "treino.xlsx",
  sourceSha256: "a".repeat(64),
  sourceSizeBytes: 2_048,
} as const;

describe("officialXlsxPlanProposalSchema", () => {
  it("accepts a bounded official plan proposal", () => {
    expect(
      officialXlsxPlanProposalSchema.parse(validProposal).sessions,
    ).toHaveLength(1);
  });

  it("rejects incomplete modality data", () => {
    const invalid = {
      ...validProposal,
      sessions: [
        {
          ...validProposal.sessions[0],
          items: [{ ...validProposal.sessions[0].items[0], repsMin: null }],
        },
      ],
    };
    expect(officialXlsxPlanProposalSchema.safeParse(invalid).success).toBe(
      false,
    );
  });

  it("rejects duplicated day order", () => {
    const invalid = {
      ...validProposal,
      sessions: [validProposal.sessions[0], validProposal.sessions[0]],
    };
    expect(officialXlsxPlanProposalSchema.safeParse(invalid).success).toBe(
      false,
    );
  });

  it("rejects planned load with more than two decimal places", () => {
    const invalid = {
      ...validProposal,
      sessions: [
        {
          ...validProposal.sessions[0],
          items: [
            {
              ...validProposal.sessions[0].items[0],
              plannedWeightKg: 40.123,
            },
          ],
        },
      ],
    };

    expect(officialXlsxPlanProposalSchema.safeParse(invalid).success).toBe(
      false,
    );
  });
});
