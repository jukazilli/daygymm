import { describe, expect, it } from "vitest";

import {
  publishTrainingPlanInputSchema,
  trainingPlanDraftItemSchema,
  trainingPlanSummarySchema,
} from "./training-plan-editor.js";

const strengthItem = {
  circuitGroup: null,
  distanceMeters: null,
  durationSeconds: null,
  exerciseName: "Supino reto",
  itemId: "10000000-0000-4000-8000-000000000001",
  loadIncrementKg: 2.5,
  loadMode: "external",
  modality: "strength",
  notes: null,
  order: 1,
  plannedWeightKg: 40,
  repsMax: 12,
  repsMin: 8,
  restSeconds: 90,
  setProgressionKg: 2.5,
  sets: 3,
} as const;

describe("training plan editor contracts", () => {
  it("accepts a versioned strength item with an equipment step", () => {
    expect(trainingPlanDraftItemSchema.parse(strengthItem)).toEqual(
      strengthItem,
    );
  });

  it("rejects load progression for cardio", () => {
    expect(() =>
      trainingPlanDraftItemSchema.parse({
        ...strengthItem,
        durationSeconds: 1_200,
        loadMode: "external",
        modality: "cardio",
        repsMax: null,
        repsMin: null,
      }),
    ).toThrow();
  });

  it("rejects duplicate weekly slots before publication", () => {
    const session = {
      dayOrder: 1,
      items: [strengthItem],
      name: "Treino A",
      sessionId: "20000000-0000-4000-8000-000000000002",
    };
    expect(() =>
      publishTrainingPlanInputSchema.parse({
        changeSummary: "Ajustei o treino",
        name: "Meu plano",
        operationId: "plan-publish:30000000-0000-4000-8000-000000000003",
        planId: null,
        sessions: [
          session,
          {
            ...session,
            sessionId: "40000000-0000-4000-8000-000000000004",
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts the versioned summary shown in the plan catalog", () => {
    expect(
      trainingPlanSummarySchema.parse({
        archivedAt: null,
        currentVersion: 10,
        itemCount: 38,
        name: "Treino - Cardio + Massa muscular",
        planId: "50000000-0000-4000-8000-000000000005",
        provenance: "manual",
        sessionCount: 6,
        updatedAt: "2026-08-15T15:00:00.000Z",
      }),
    ).toEqual(expect.objectContaining({ currentVersion: 10, sessionCount: 6 }));
  });

  it("accepts the timezone offset returned by PostgREST for timestamptz", () => {
    expect(
      trainingPlanSummarySchema.parse({
        archivedAt: "2026-08-14T15:00:00+00:00",
        currentVersion: 3,
        itemCount: 18,
        name: "Plano anterior",
        planId: "60000000-0000-4000-8000-000000000006",
        provenance: "official_xlsx",
        sessionCount: 4,
        updatedAt: "2026-08-15T15:00:00.123456+00:00",
      }),
    ).toEqual(
      expect.objectContaining({
        archivedAt: "2026-08-14T15:00:00+00:00",
        updatedAt: "2026-08-15T15:00:00.123456+00:00",
      }),
    );
  });
});
