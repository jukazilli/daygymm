import type {
  ActiveTrainingRun,
  PracticalTrainingSet,
  PracticalTrainingState,
  SetCompletion,
  SetCompletionInput,
  SetRevision,
  SetRevisionInput,
  TrainingPauseState,
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

export function applyCompletedTrainingSetWithRest(
  state: PracticalTrainingState,
  input: SetCompletionInput,
  completion: SetCompletion,
): PracticalTrainingState {
  const next = applyCompletedTrainingSet(state, input, completion);
  const run = next.activeRun;
  const source = run?.session.items.find(
    (item) => item.itemId === input.itemId,
  );
  const firstPending = run?.session.items.find((item) => !item.completedAt);

  if (!completion.wasCreated) {
    return next;
  }

  if (
    !run ||
    run.runId !== input.runId ||
    !source ||
    source.restSeconds <= 0 ||
    !firstPending
  ) {
    return { ...next, activeRest: null };
  }

  return {
    ...next,
    activeRest: {
      durationSeconds: source.restSeconds,
      endsAt: new Date(
        new Date(completion.completedAt).getTime() + source.restSeconds * 1_000,
      ).toISOString(),
      nextItemId: completion.exerciseCompleted
        ? firstPending.itemId
        : source.itemId,
      runId: run.runId,
      setNumber: completion.setNumber,
      sourceItemId: source.itemId,
    },
  };
}

export function applyStartedTraining(
  state: PracticalTrainingState,
  run: ActiveTrainingRun,
): PracticalTrainingState {
  return {
    ...state,
    activeRest: null,
    activeRun: run,
    nextSession: run.session,
  };
}

export function applyStartedExercise(
  state: PracticalTrainingState,
  runId: string,
  itemId: string,
  startedAt: string,
): PracticalTrainingState {
  const activeRun = state.activeRun;
  if (!activeRun || activeRun.runId !== runId) {
    return state;
  }
  const items = activeRun.session.items.map((item) =>
    item.itemId === itemId && !item.completedAt
      ? { ...item, startedAt: item.startedAt ?? startedAt }
      : item,
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

export function applyTrainingPauseState(
  state: PracticalTrainingState,
  pause: TrainingPauseState,
): PracticalTrainingState {
  return state.activeRun?.runId === pause.runId
    ? {
        ...state,
        activeRun: {
          ...state.activeRun,
          pausedAt: pause.pausedAt,
          pausedDurationSeconds: pause.pausedDurationSeconds,
        },
      }
    : state;
}

export function applyRevisedTrainingSet(
  state: PracticalTrainingState,
  input: SetRevisionInput,
  revision: SetRevision,
): PracticalTrainingState {
  const activeRun = state.activeRun;
  const exercise = activeRun?.session.items.find(
    (item) => item.itemId === input.itemId,
  );
  if (!activeRun || activeRun.runId !== input.runId || !exercise) {
    return state;
  }

  const setExecutions =
    input.action === "undo"
      ? exercise.setExecutions.filter(
          (set) => set.setNumber !== input.setNumber,
        )
      : exercise.setExecutions.map((set) =>
          set.setNumber === input.setNumber
            ? {
                ...set,
                actualDistanceMeters: input.actualDistanceMeters,
                actualDurationSeconds: input.actualDurationSeconds,
                actualReps: input.actualReps,
                actualWeightKg: input.actualWeightKg,
                revision: revision.revision ?? set.revision + 1,
                updatedAt: revision.changedAt,
              }
            : set,
        );
  const items = activeRun.session.items.map((item) =>
    item.itemId === input.itemId
      ? {
          ...item,
          completedAt: revision.exerciseCompleted
            ? (item.completedAt ?? revision.changedAt)
            : null,
          setExecutions,
        }
      : item,
  );
  const session = { ...activeRun.session, items };
  return {
    ...state,
    activeRest:
      state.activeRest?.runId === input.runId ? null : state.activeRest,
    activeRun: { ...activeRun, session },
    nextSession:
      state.nextSession?.sessionId === session.sessionId
        ? session
        : state.nextSession,
  };
}

export function applyCancelledTraining(
  state: PracticalTrainingState,
  runId: string,
): PracticalTrainingState {
  if (state.activeRun?.runId !== runId) {
    return state;
  }
  const planned =
    state.sessions.find(
      (session) => session.sessionId === state.activeRun?.session.sessionId,
    ) ?? state.nextSession;
  return {
    ...state,
    activeRest: null,
    activeRun: null,
    nextSession: planned,
  };
}

export function applyFinishedTraining(
  state: PracticalTrainingState,
  runId: string,
  completedAt: string,
): PracticalTrainingState {
  return state.activeRun?.runId === runId
    ? {
        ...state,
        activeRest: null,
        activeRun: null,
        lastCompletedAt: completedAt,
      }
    : state;
}
