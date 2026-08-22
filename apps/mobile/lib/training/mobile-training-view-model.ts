import type {
  PracticalTrainingExercise,
  SetCompletionInput,
  TrainingSessionSyncState,
} from "@daygym/contracts";

export interface TrainingMeasureDraft {
  readonly distanceMeters: string;
  readonly durationSeconds: string;
  readonly reps: string;
  readonly weightKg: string;
}

export const syncStatusLabel: Record<
  TrainingSessionSyncState["status"],
  string
> = {
  conflict: "Sincronização bloqueada",
  offline: "Salvo neste aparelho",
  pending: "Sincronização pendente",
  synced: "Sincronizado",
  syncing: "Sincronizando…",
};

function parsedPositiveInteger(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsedWeight(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 2_000
    ? Math.round(parsed * 100) / 100
    : null;
}

export function draftForExercise(
  exercise: PracticalTrainingExercise,
): TrainingMeasureDraft {
  const lastSet = exercise.setExecutions.at(-1);
  const nextSetNumber = Math.min(
    exercise.sets,
    exercise.setExecutions.length + 1,
  );
  const plannedWeight =
    exercise.plannedWeightKg === null
      ? lastSet?.actualWeightKg
      : exercise.plannedWeightKg +
        (exercise.setProgressionKg ?? 0) * (nextSetNumber - 1);

  return {
    distanceMeters: String(
      exercise.distanceMeters ?? lastSet?.actualDistanceMeters ?? "",
    ),
    durationSeconds: String(
      exercise.durationSeconds ?? lastSet?.actualDurationSeconds ?? "",
    ),
    reps: String(exercise.repsMax ?? lastSet?.actualReps ?? ""),
    weightKg:
      plannedWeight === null || plannedWeight === undefined
        ? ""
        : String(Math.round(plannedWeight * 100) / 100),
  };
}

export function completionInput(
  runId: string,
  exercise: PracticalTrainingExercise,
  draft: TrainingMeasureDraft,
): SetCompletionInput | null {
  const actualReps =
    exercise.repsMax === null ? null : parsedPositiveInteger(draft.reps);
  const actualDurationSeconds =
    exercise.durationSeconds === null
      ? null
      : parsedPositiveInteger(draft.durationSeconds);
  const actualDistanceMeters =
    exercise.distanceMeters === null
      ? null
      : parsedPositiveInteger(draft.distanceMeters);
  const actualWeightKg = parsedWeight(draft.weightKg);

  if (
    (exercise.repsMax !== null && actualReps === null) ||
    (exercise.durationSeconds !== null && actualDurationSeconds === null) ||
    (exercise.distanceMeters !== null && actualDistanceMeters === null) ||
    (actualReps === null &&
      actualDurationSeconds === null &&
      actualDistanceMeters === null)
  ) {
    return null;
  }

  return {
    actualDistanceMeters,
    actualDurationSeconds,
    actualReps,
    actualWeightKg,
    itemId: exercise.itemId,
    runId,
    setNumber: exercise.setExecutions.length + 1,
  };
}

export function elapsedTrainingSeconds(
  startedAt: string,
  pausedAt: string | null,
  pausedDurationSeconds: number,
  now: Date,
) {
  const end = pausedAt ? new Date(pausedAt) : now;
  return Math.max(
    0,
    Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1_000) -
      pausedDurationSeconds,
  );
}

export function pendingExerciseIndex(
  exercises: readonly PracticalTrainingExercise[],
) {
  const index = exercises.findIndex((exercise) => !exercise.completedAt);
  return index < 0 ? Math.max(0, exercises.length - 1) : index;
}

export function formattedDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
