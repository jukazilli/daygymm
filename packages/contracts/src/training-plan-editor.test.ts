import { describe, expect, it } from "vitest";

import {
  publishTrainingPlanInputSchema,
  trainingPlanDraftItemSchema,
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
});
