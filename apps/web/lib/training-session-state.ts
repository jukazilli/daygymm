import type {
  PracticalTrainingSet,
  PracticalTrainingState,
  SetCompletion,
  SetCompletionInput,
} from "@daygym/contracts";

function roundedWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function suggestedSetWeight(
  plannedWeightKg: number | null,
  setProgressionKg: number | null,
  setNumber: number,
) {
  if (plannedWeightKg === null) {
    return null;
  }

  return roundedWeight(
    plannedWeightKg + (setProgressionKg ?? 0) * (setNumber - 1),
  );
}

export function applyCompletedTrainingSet(
  state: PracticalTrainingState,
  input: SetCompletionInput,
  completion: SetCompletion,
): PracticalTrainingState {
  const activeRun = state.activeRun;
  const exerciseIndex = activeRun?.session.items.findIndex(
    (candidate) => candidate.itemId === input.itemId,
  );
  const exercise =
    exerciseIndex === undefined || exerciseIndex < 0
      ? undefined
      : activeRun?.session.items[exerciseIndex];

  if (!activeRun || !exercise || activeRun.runId !== input.runId) {
    return state;
  }

  const previous = exercise.setExecutions.find(
    (candidate) => candidate.setNumber === input.setNumber,
  );
  const completedSet: PracticalTrainingSet = {
    actualDistanceMeters: input.actualDistanceMeters,
    actualDurationSeconds: input.actualDurationSeconds,
    actualReps: input.actualReps,
    actualWeightKg: input.actualWeightKg,
    completedAt: completion.completedAt,
    plannedDistanceMeters: exercise.distanceMeters,
    plannedDurationSeconds: exercise.durationSeconds,
    plannedRepsMax: exercise.repsMax,
    plannedRepsMin: exercise.repsMin,
    plannedWeightKg: suggestedSetWeight(
      exercise.plannedWeightKg,
      exercise.setProgressionKg,
      input.setNumber,
    ),
    revision: previous?.revision ?? 1,
    setExecutionId: completion.setExecutionId,
    setNumber: input.setNumber,
    updatedAt: completion.completedAt,
  };
  const setExecutions = exercise.setExecutions
    .filter((candidate) => candidate.setNumber !== input.setNumber)
    .concat(completedSet)
    .sort((left, right) => left.setNumber - right.setNumber);
  const items = activeRun.session.items.map((candidate, index) =>
    index === exerciseIndex
      ? {
          ...candidate,
          completedAt: completion.exerciseCompleted
            ? completion.completedAt
            : candidate.completedAt,
          setExecutions,
        }
      : candidate,
  );
  const session = { ...activeRun.session, items };

  return {
    ...state,
    activeRun: { ...activeRun, session },
    nextSession:
      state.nextSession?.sessionId === session.sessionId
        ? session
        : state.nextSession,
  };
}
