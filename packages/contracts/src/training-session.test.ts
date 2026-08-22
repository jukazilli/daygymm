import { describe, expect, it } from "vitest";

import {
  practicalTrainingStateSchema,
  practicalTrainingPlanSessionSchema,
  setRevisionInputSchema,
  setCompletionInputSchema,
} from "./training-session.js";

const session = {
  dayOrder: 1,
  items: [
    {
      approvedAlternatives: [],
      circuitGroup: null,
      completedAt: null,
      distanceMeters: null,
      durationSeconds: null,
      exerciseName: "Agachamento",
      itemId: "51000000-0000-4000-8000-000000000001",
      setProgressionKg: 2.5,
      modality: "strength",
      notes: null,
      order: 1,
      plannedExerciseName: "Agachamento",
      plannedWeightKg: 40,
      previousSetReferences: [],
      repsMax: 12,
      repsMin: 8,
      restSeconds: 90,
      sets: 3,
      setExecutions: [],
      startedAt: null,
      substitution: null,
    },
  ],
  name: "Treino A",
  sessionId: "52000000-0000-4000-8000-000000000002",
  weekday: 1,
} as const;

describe("practical training contracts", () => {
  it("accepts an executable imported plan session", () => {
    expect(practicalTrainingPlanSessionSchema.parse(session)).toEqual(session);
  });

  it("rejects a session without exercises", () => {
    expect(() =>
      practicalTrainingPlanSessionSchema.parse({ ...session, items: [] }),
    ).toThrow();
  });

  it("represents an active run without mutating the immutable plan", () => {
    const state = practicalTrainingStateSchema.parse({
      activeRun: {
        pausedAt: null,
        pausedDurationSeconds: 0,
        runId: "53000000-0000-4000-8000-000000000003",
        session,
        startedAt: "2026-08-14T03:30:00.000Z",
      },
      lastCompletedAt: null,
      nextSession: session,
      plan: {
        itemCount: 1,
        name: "Meu plano",
        planId: "54000000-0000-4000-8000-000000000004",
        sessionCount: 1,
        version: 1,
        versionId: "55000000-0000-4000-8000-000000000005",
        wasCreated: false,
      },
      sessions: [session],
    });

    expect(state.activeRun?.session.items[0]?.completedAt).toBeNull();
    expect(state.plan?.version).toBe(1);
  });

  it("accepts the timestamp offset returned by PostgREST", () => {
    const result = practicalTrainingStateSchema.safeParse({
      activeRun: {
        pausedAt: null,
        pausedDurationSeconds: 0,
        runId: "53000000-0000-4000-8000-000000000003",
        session,
        startedAt: "2026-08-14T03:30:00.123456+00:00",
      },
      lastCompletedAt: null,
      nextSession: session,
      plan: null,
      sessions: [session],
    });

    expect(result.success).toBe(true);
  });

  it("requires a performed measure when completing a set", () => {
    const base = {
      actualDistanceMeters: null,
      actualDurationSeconds: null,
      actualReps: null,
      actualWeightKg: 40,
      itemId: "51000000-0000-4000-8000-000000000001",
      runId: "53000000-0000-4000-8000-000000000003",
      setNumber: 1,
    };

    expect(setCompletionInputSchema.safeParse(base).success).toBe(false);
    expect(
      setCompletionInputSchema.safeParse({ ...base, actualReps: 12 }).success,
    ).toBe(true);
    expect(
      setCompletionInputSchema.safeParse({
        ...base,
        actualReps: 12,
        actualWeightKg: 40.123,
      }).success,
    ).toBe(false);
  });

  it("separates correction values from a set undo command", () => {
    const identity = {
      expectedRevision: 2,
      itemId: "51000000-0000-4000-8000-000000000001",
      runId: "53000000-0000-4000-8000-000000000003",
      setExecutionId: "56000000-0000-4000-8000-000000000006",
      setNumber: 1,
    };

    expect(
      setRevisionInputSchema.safeParse({
        ...identity,
        action: "correct",
        actualDistanceMeters: null,
        actualDurationSeconds: null,
        actualReps: 10,
        actualWeightKg: 42.5,
      }).success,
    ).toBe(true);
    expect(
      setRevisionInputSchema.safeParse({ ...identity, action: "undo" }).success,
    ).toBe(true);
    expect(
      setRevisionInputSchema.safeParse({
        ...identity,
        action: "correct",
        actualDistanceMeters: null,
        actualDurationSeconds: null,
        actualReps: null,
        actualWeightKg: 42.5,
      }).success,
    ).toBe(false);
  });
});
