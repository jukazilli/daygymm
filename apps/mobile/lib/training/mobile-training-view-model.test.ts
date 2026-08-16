import { describe, expect, it } from "vitest";

import type { PracticalTrainingExercise } from "@daygym/contracts";

import {
  completionInput,
  draftForExercise,
  elapsedTrainingSeconds,
  formattedDuration,
  pendingExerciseIndex,
  syncStatusLabel,
} from "./mobile-training-view-model";

function exercise(
  overrides: Partial<PracticalTrainingExercise> = {},
): PracticalTrainingExercise {
  return {
    circuitGroup: null,
    completedAt: null,
    distanceMeters: null,
    durationSeconds: null,
    exerciseName: "Agachamento",
    itemId: "60000000-0000-4000-8000-000000000003",
    modality: "strength",
    notes: null,
    order: 1,
    plannedWeightKg: 40,
    previousSetReferences: [],
    repsMax: 12,
    repsMin: 8,
    restSeconds: 90,
    setExecutions: [],
    setProgressionKg: 2.5,
    sets: 3,
    startedAt: null,
    ...overrides,
  };
}

describe("mobile training view model", () => {
  it("builds the next strength set from the plan", () => {
    const current = exercise();
    const draft = draftForExercise(current);

    expect(draft).toMatchObject({ reps: "12", weightKg: "40" });
    expect(
      completionInput("60000000-0000-4000-8000-000000000002", current, draft),
    ).toMatchObject({ actualReps: 12, actualWeightKg: 40, setNumber: 1 });
  });

  it("rejects a required measure that is missing", () => {
    expect(
      completionInput("60000000-0000-4000-8000-000000000002", exercise(), {
        distanceMeters: "",
        durationSeconds: "",
        reps: "",
        weightKg: "",
      }),
    ).toBeNull();
  });

  it("derives elapsed time from timestamps and excludes pauses", () => {
    expect(
      elapsedTrainingSeconds(
        "2026-08-16T20:00:00.000Z",
        null,
        120,
        new Date("2026-08-16T20:32:05.000Z"),
      ),
    ).toBe(1_805);
    expect(formattedDuration(1_805)).toBe("00:30:05");
  });

  it("keeps elapsed time frozen while paused", () => {
    expect(
      elapsedTrainingSeconds(
        "2026-08-16T20:00:00.000Z",
        "2026-08-16T20:10:00.000Z",
        60,
        new Date("2026-08-16T21:00:00.000Z"),
      ),
    ).toBe(540);
  });

  it("selects the first pending exercise", () => {
    expect(
      pendingExerciseIndex([
        exercise({ completedAt: "2026-08-16T20:02:00.000Z" }),
        exercise({ itemId: "60000000-0000-4000-8000-000000000004" }),
      ]),
    ).toBe(1);
  });

  it("uses product language for synchronization states", () => {
    expect(syncStatusLabel.offline).toBe("Salvo neste aparelho");
    expect(syncStatusLabel.conflict).toBe("Sincronização bloqueada");
  });
});
