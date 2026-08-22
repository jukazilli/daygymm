"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ActiveTrainingRun,
  CompletedTrainingSession,
  ExerciseSubstitutionInput,
  LocalFirstTrainingSessionGateway,
  PracticalTrainingExercise,
  PracticalTrainingSet,
  PracticalTrainingState,
  SetCompletionInput,
  SetRevisionInput,
  TrainingSessionGateway,
  TrainingCompletionStatus,
  TrainingSessionSyncState,
} from "@daygym/contracts";

import { createLocalFirstTrainingSessionGateway } from "../../lib/local-first-training-session-gateway";
import {
  applyCompletedTrainingSetWithRest,
  applyExerciseSubstitution,
} from "../../lib/training-session-state";
import {
  formatTrainingDuration,
  maximumExerciseDurationSeconds,
} from "../../lib/training-duration";
import { trainingWeekdayName } from "../../lib/training-weekdays";
import { AppIcon } from "./app-icon";
import { AppLoadingSkeleton } from "./app-shell";
import { DurationInput } from "./duration-input";

interface ActiveTrainingScreenProps {
  readonly gateway?: TrainingSessionGateway;
  readonly navigate?: (path: string) => void;
  readonly plannedSessionId?: string;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setDocumentScrollTop(top: number) {
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}

function roundedWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function formatWeight(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function suggestedSetWeight(
  exercise: PracticalTrainingExercise,
  setNumber: number,
) {
  if (exercise.plannedWeightKg === null) {
    return null;
  }
  return roundedWeight(
    exercise.plannedWeightKg +
      (exercise.setProgressionKg ?? 0) * (setNumber - 1),
  );
}

function exerciseTarget(exercise: PracticalTrainingExercise) {
  const prefix = `${exercise.sets} ${exercise.sets === 1 ? "série" : "séries"}`;
  const targets = [
    exercise.repsMin !== null && exercise.repsMax !== null
      ? exercise.repsMin === exercise.repsMax
        ? `${exercise.repsMin} repetições`
        : `${exercise.repsMin}–${exercise.repsMax} repetições`
      : null,
    exercise.plannedWeightKg !== null ? `${exercise.plannedWeightKg} kg` : null,
    exercise.setProgressionKg !== null && exercise.setProgressionKg > 0
      ? `+${formatWeight(exercise.setProgressionKg)} kg/série`
      : null,
    exercise.durationSeconds
      ? formatTrainingDuration(exercise.durationSeconds)
      : null,
    exercise.distanceMeters ? `${exercise.distanceMeters} m` : null,
  ].filter(Boolean);
  return targets.length > 0 ? `${prefix} · ${targets.join(" · ")}` : prefix;
}

function currentSetTarget(
  exercise: PracticalTrainingExercise,
  setNumber: number,
) {
  const suggestedWeight = suggestedSetWeight(exercise, setNumber);
  const targets = [
    exercise.repsMin !== null && exercise.repsMax !== null
      ? exercise.repsMin === exercise.repsMax
        ? `${exercise.repsMin} repetições`
        : `${exercise.repsMin}–${exercise.repsMax} repetições`
      : null,
    suggestedWeight !== null ? `${formatWeight(suggestedWeight)} kg` : null,
    exercise.durationSeconds
      ? formatTrainingDuration(exercise.durationSeconds)
      : null,
    exercise.distanceMeters ? `${exercise.distanceMeters} m` : null,
  ].filter(Boolean);
  return targets.length > 0 ? targets.join(" · ") : "Repetições ou tempo";
}

function setResult(exercise: PracticalTrainingExercise, setIndex: number) {
  const performed = exercise.setExecutions[setIndex];
  if (!performed) {
    return null;
  }
  return [
    performed.actualWeightKg !== null
      ? `${formatWeight(performed.actualWeightKg)} kg`
      : null,
    performed.actualReps !== null ? `${performed.actualReps} repetições` : null,
    performed.actualDurationSeconds !== null
      ? formatTrainingDuration(performed.actualDurationSeconds)
      : null,
    performed.actualDistanceMeters !== null
      ? `${performed.actualDistanceMeters} m`
      : null,
  ]
    .filter(Boolean)
    .join(" × ");
}

function referenceResult(
  exercise: PracticalTrainingExercise,
  setNumber: number,
) {
  const reference = exercise.previousSetReferences.find(
    (candidate) => candidate.setNumber === setNumber,
  );
  if (!reference) {
    return null;
  }
  const result = [
    reference.actualWeightKg !== null
      ? `${formatWeight(reference.actualWeightKg)} kg`
      : null,
    reference.actualReps !== null ? `${reference.actualReps} repetições` : null,
    reference.actualDurationSeconds !== null
      ? formatTrainingDuration(reference.actualDurationSeconds)
      : null,
    reference.actualDistanceMeters !== null
      ? `${reference.actualDistanceMeters} m`
      : null,
  ]
    .filter(Boolean)
    .join(" × ");
  return result
    ? {
        completedAt: new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "short",
        }).format(new Date(reference.completedAt)),
        result,
      }
    : null;
}

function parsedInteger(value: string) {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

function parsedDecimal(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    return null;
  }
  return Number(value.replace(",", "."));
}

type MissingMeasure = "duration" | "reps";

type SetRevisionRequest =
  | {
      readonly action: "correct";
      readonly actualDistanceMeters: number | null;
      readonly actualDurationSeconds: number | null;
      readonly actualReps: number | null;
      readonly actualWeightKg: number | null;
      readonly set: PracticalTrainingSet;
    }
  | { readonly action: "undo"; readonly set: PracticalTrainingSet };

interface FinishedTrainingSummary {
  readonly adherencePercent: number;
  readonly completedSets: number;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly plannedSets: number;
  readonly completionStatus: TrainingCompletionStatus;
  readonly recordedDurationSeconds: number;
  readonly substitutions: readonly {
    readonly exerciseName: string;
    readonly plannedExerciseName: string;
  }[];
  readonly volumeKg: number;
}

function trainingSummary(
  run: ActiveTrainingRun,
  completed: CompletedTrainingSession,
): FinishedTrainingSummary {
  const sets = run.session.items.flatMap((item) => item.setExecutions);
  const plannedSets = run.session.items.reduce(
    (total, item) => total + item.sets,
    0,
  );
  const completedSets = sets.length;
  return {
    adherencePercent:
      plannedSets > 0
        ? Math.min(100, Math.round((completedSets / plannedSets) * 100))
        : 0,
    completedSets,
    completionStatus: completed.completionStatus,
    distanceMeters: sets.reduce(
      (total, set) => total + (set.actualDistanceMeters ?? 0),
      0,
    ),
    durationSeconds: completed.durationSeconds,
    plannedSets,
    recordedDurationSeconds: sets.reduce(
      (total, set) => total + (set.actualDurationSeconds ?? 0),
      0,
    ),
    substitutions: run.session.items.flatMap((item) =>
      item.substitution
        ? [
            {
              exerciseName: item.substitution.exerciseName,
              plannedExerciseName: item.substitution.plannedExerciseName,
            },
          ]
        : [],
    ),
    volumeKg: roundedWeight(
      sets.reduce(
        (total, set) =>
          total + (set.actualWeightKg ?? 0) * (set.actualReps ?? 0),
        0,
      ),
    ),
  };
}

function PartialTrainingDialog({
  busy,
  completedSets,
  onClose,
  onConfirm,
  onReview,
  plannedSets,
}: Readonly<{
  busy: boolean;
  completedSets: number;
  onClose: () => void;
  onConfirm: () => void;
  onReview: () => void;
  plannedSets: number;
}>) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div
      className="session-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="partial-training-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <h2 id="partial-training-title">Ainda há séries pendentes</h2>
        <p>
          Você concluiu {completedSets} de {plannedSets} séries.
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            disabled={busy}
            onClick={onClose}
            ref={continueRef}
            type="button"
          >
            Continuar treino
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onReview}
            type="button"
          >
            Revisar pendências
          </button>
          <button
            className="button-text partial-training-confirm"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Finalizando…" : "Concluir parcialmente"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SetRevisionDialog({
  busy,
  exercise,
  isLatest,
  onBack,
  onComplete,
  onRevise,
  set,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  isLatest: boolean;
  onBack: () => void;
  onComplete: () => void;
  onRevise: (request: SetRevisionRequest) => Promise<boolean>;
  set: PracticalTrainingSet;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const [reps, setReps] = useState(
    set.actualReps === null ? "" : String(set.actualReps),
  );
  const [weight, setWeight] = useState(
    set.actualWeightKg === null ? "" : String(set.actualWeightKg),
  );
  const [durationSeconds, setDurationSeconds] = useState(
    set.actualDurationSeconds,
  );
  const [distance, setDistance] = useState(
    set.actualDistanceMeters === null ? "" : String(set.actualDistanceMeters),
  );
  const actualReps = set.actualReps === null ? null : parsedInteger(reps);
  const actualWeightKg = weight ? parsedDecimal(weight) : null;
  const actualDurationSeconds =
    set.actualDurationSeconds === null ? null : durationSeconds;
  const actualDistanceMeters =
    set.actualDistanceMeters === null ? null : parsedInteger(distance);
  const isValid =
    (set.actualReps === null || actualReps !== null) &&
    (set.actualDurationSeconds === null || actualDurationSeconds !== null) &&
    (set.actualDistanceMeters === null || actualDistanceMeters !== null);
  const isChanged =
    actualReps !== set.actualReps ||
    actualWeightKg !== set.actualWeightKg ||
    actualDurationSeconds !== set.actualDurationSeconds ||
    actualDistanceMeters !== set.actualDistanceMeters;

  useEffect(() => {
    dialogRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onBack();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onBack]);

  async function saveCorrection() {
    if (!isValid || !isChanged) {
      return;
    }
    const succeeded = await onRevise({
      action: "correct",
      actualDistanceMeters,
      actualDurationSeconds,
      actualReps,
      actualWeightKg,
      set,
    });
    if (succeeded) {
      onComplete();
    }
  }

  async function undoSet() {
    const succeeded = await onRevise({ action: "undo", set });
    if (succeeded) {
      onComplete();
    }
  }

  return (
    <div className="focused-flow-backdrop" role="presentation">
      <section
        aria-labelledby="set-revision-title"
        aria-modal="true"
        className="focused-flow-dialog set-revision-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="focused-flow-header">
          <button
            aria-label="Voltar"
            className="focused-back-action"
            disabled={busy}
            onClick={onBack}
            type="button"
          >
            <AppIcon name="back" size={30} />
          </button>
        </header>
        <div className="focused-flow-content">
          <p className="eyebrow">{exercise.exerciseName}</p>
          <h2 id="set-revision-title">Série {set.setNumber}</h2>
          <div className="set-fields">
            {exercise.modality === "strength" ? (
              <label>
                <span>
                  Carga <small>kg</small>
                </span>
                <input
                  inputMode="decimal"
                  min="0.25"
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="—"
                  step="0.01"
                  type="number"
                  value={weight}
                />
              </label>
            ) : null}
            {set.actualReps !== null ? (
              <label>
                <span>Repetições</span>
                <input
                  inputMode="numeric"
                  max="1000"
                  min="1"
                  onChange={(event) => setReps(event.target.value)}
                  type="number"
                  value={reps}
                />
              </label>
            ) : null}
            {set.actualDurationSeconds !== null ? (
              <label>
                <span>Tempo</span>
                <DurationInput
                  maximum={maximumExerciseDurationSeconds}
                  minimum={1}
                  onChange={setDurationSeconds}
                  required
                  seconds={durationSeconds}
                />
              </label>
            ) : null}
            {set.actualDistanceMeters !== null ? (
              <label>
                <span>
                  Distância <small>metros</small>
                </span>
                <input
                  inputMode="numeric"
                  max="100000"
                  min="1"
                  onChange={(event) => setDistance(event.target.value)}
                  type="number"
                  value={distance}
                />
              </label>
            ) : null}
          </div>
          {isLatest ? (
            <button
              className="button-danger set-undo-action"
              disabled={busy}
              onClick={() => void undoSet()}
              type="button"
            >
              Desfazer esta série
            </button>
          ) : null}
        </div>
        <div className="focused-flow-action">
          <button
            className="button-primary"
            disabled={busy || !isValid || !isChanged}
            onClick={() => void saveCorrection()}
            type="button"
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SetSelectionDialog({
  exercise,
  onClose,
  onContinue,
}: Readonly<{
  exercise: PracticalTrainingExercise;
  onClose: () => void;
  onContinue: (set: PracticalTrainingSet) => void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const [selectedSetId, setSelectedSetId] = useState(
    exercise.setExecutions.at(-1)?.setExecutionId,
  );
  const selectedSet = exercise.setExecutions.find(
    (set) => set.setExecutionId === selectedSetId,
  );

  useEffect(() => {
    dialogRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="focused-flow-backdrop" role="presentation">
      <section
        aria-labelledby="set-selection-title"
        aria-modal="true"
        className="focused-flow-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="focused-flow-header">
          <button
            aria-label="Voltar"
            className="focused-back-action"
            onClick={onClose}
            type="button"
          >
            <AppIcon name="back" size={30} />
          </button>
        </header>
        <div className="focused-flow-content">
          <p className="eyebrow">{exercise.exerciseName}</p>
          <h2 id="set-selection-title">Escolha uma série</h2>
          <fieldset className="set-selection-list">
            <legend className="sr-only">Séries concluídas</legend>
            {exercise.setExecutions.map((set, index) => (
              <label key={set.setExecutionId}>
                <input
                  checked={selectedSetId === set.setExecutionId}
                  name="completed-set"
                  onChange={() => setSelectedSetId(set.setExecutionId)}
                  type="radio"
                  value={set.setExecutionId}
                />
                <span>Série {set.setNumber}</span>
                <strong>{setResult(exercise, index)}</strong>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="focused-flow-action">
          <button
            className="button-primary"
            disabled={!selectedSet}
            onClick={() => selectedSet && onContinue(selectedSet)}
            type="button"
          >
            Continuar
          </button>
        </div>
      </section>
    </div>
  );
}

function SetRevisionFlow({
  busy,
  exercise,
  onClose,
  onRevise,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onClose: () => void;
  onRevise: (request: SetRevisionRequest) => Promise<boolean>;
}>) {
  const [selectedSet, setSelectedSet] = useState<PracticalTrainingSet>();

  if (!selectedSet) {
    return (
      <SetSelectionDialog
        exercise={exercise}
        onClose={onClose}
        onContinue={setSelectedSet}
      />
    );
  }

  return (
    <SetRevisionDialog
      busy={busy}
      exercise={exercise}
      isLatest={
        selectedSet.setNumber === exercise.setExecutions.at(-1)?.setNumber
      }
      onBack={() => setSelectedSet(undefined)}
      onComplete={onClose}
      onRevise={onRevise}
      set={selectedSet}
    />
  );
}

export function SetCompletionSheet({
  busy,
  exercise,
  onAdjustPrevious,
  onCompleteSet,
  onClose,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onAdjustPrevious?: () => void;
  onCompleteSet: (
    input: Omit<SetCompletionInput, "itemId" | "runId">,
  ) => Promise<boolean>;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const lastSet = exercise.setExecutions.at(-1);
  const [saveFailed, setSaveFailed] = useState(false);
  const [missingMeasure, setMissingMeasure] = useState<
    MissingMeasure | undefined
  >(
    lastSet?.actualReps !== null && lastSet?.actualReps !== undefined
      ? "reps"
      : lastSet?.actualDurationSeconds !== null &&
          lastSet?.actualDurationSeconds !== undefined
        ? "duration"
        : undefined,
  );
  const hasPlannedReps = exercise.repsMin !== null && exercise.repsMax !== null;
  const needsReps = hasPlannedReps || missingMeasure === "reps";
  const needsDuration =
    exercise.durationSeconds !== null || missingMeasure === "duration";
  const needsDistance = exercise.distanceMeters !== null;
  const hasKnownMeasure = hasPlannedReps || needsDuration || needsDistance;
  const nextSet = exercise.setExecutions.length + 1;
  const suggestedWeight = suggestedSetWeight(exercise, nextSet);
  const previousResult = referenceResult(exercise, nextSet);
  const [reps, setReps] = useState(
    hasPlannedReps
      ? String(exercise.repsMax)
      : lastSet?.actualReps !== null && lastSet?.actualReps !== undefined
        ? String(lastSet.actualReps)
        : "",
  );
  const [weight, setWeight] = useState(
    suggestedWeight !== null
      ? String(suggestedWeight)
      : lastSet?.actualWeightKg !== null &&
          lastSet?.actualWeightKg !== undefined
        ? String(lastSet.actualWeightKg)
        : "",
  );
  const [durationSeconds, setDurationSeconds] = useState<number | null>(
    exercise.durationSeconds ?? lastSet?.actualDurationSeconds ?? null,
  );
  const [distance, setDistance] = useState(
    exercise.distanceMeters !== null ? String(exercise.distanceMeters) : "",
  );
  const weightStep =
    exercise.setProgressionKg && exercise.setProgressionKg > 0
      ? exercise.setProgressionKg
      : 0.25;
  const actualReps = needsReps ? parsedInteger(reps) : null;
  const actualWeightKg = weight ? parsedDecimal(weight) : null;
  const actualDurationSeconds = needsDuration ? durationSeconds : null;
  const actualDistanceMeters = needsDistance ? parsedInteger(distance) : null;
  const canComplete =
    nextSet <= exercise.sets &&
    (!needsReps || actualReps !== null) &&
    (!needsDuration || actualDurationSeconds !== null) &&
    (!needsDistance || actualDistanceMeters !== null);

  useEffect(() => {
    const firstField = dialogRef.current?.querySelector<HTMLElement>(
      "input:not(:disabled)",
    );
    const firstAction = dialogRef.current?.querySelector<HTMLElement>(
      "button:not(:disabled)",
    );
    (firstField ?? firstAction)?.focus();

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        ) ?? [],
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [busy, onClose]);

  function adjustWeight(direction: -1 | 1) {
    const currentWeight =
      parsedDecimal(weight) ?? suggestedWeight ?? weightStep;
    const adjusted = roundedWeight(currentWeight + direction * weightStep);
    setWeight(String(Math.min(2_000, Math.max(0.25, adjusted))));
  }

  async function saveSet() {
    if (!canComplete || busy) {
      return;
    }
    setSaveFailed(false);
    const saved = await onCompleteSet({
      actualDistanceMeters,
      actualDurationSeconds,
      actualReps,
      actualWeightKg,
      setNumber: nextSet,
    });
    if (saved) {
      onClose();
      return;
    }
    setSaveFailed(true);
  }

  return (
    <div
      className="set-completion-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="set-completion-title"
        aria-modal="true"
        className="set-completion-sheet"
        ref={dialogRef}
        role="dialog"
      >
        <div className="rest-sheet-handle" aria-hidden="true" />
        <header className="set-completion-header">
          <div>
            <p className="eyebrow">{exercise.exerciseName}</p>
            <h2 id="set-completion-title">
              Série {nextSet} de {exercise.sets}
            </h2>
          </div>
          <button
            className="button-text"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Voltar
          </button>
        </header>

        {previousResult ? (
          <div className="previous-set-reference">
            <span>Última vez · {previousResult.completedAt}</span>
            <strong>{previousResult.result}</strong>
          </div>
        ) : null}

        {exercise.notes ? (
          <p className="set-completion-notes">
            <strong>Orientação</strong>
            <span>{exercise.notes}</span>
          </p>
        ) : null}

        {!hasKnownMeasure && !missingMeasure ? (
          <fieldset className="measure-choice">
            <legend>Como você mediu esta série?</legend>
            <button onClick={() => setMissingMeasure("reps")} type="button">
              Repetições
            </button>
            <button onClick={() => setMissingMeasure("duration")} type="button">
              Tempo
            </button>
          </fieldset>
        ) : null}

        {hasKnownMeasure || missingMeasure ? (
          <div className="set-fields">
            {exercise.modality === "strength" ? (
              <div className="set-load-field">
                <label htmlFor={`set-weight-${exercise.itemId}`}>
                  Carga <small>kg</small>
                </label>
                <div className="set-load-control">
                  <button
                    aria-label={`Reduzir carga em ${formatWeight(weightStep)} kg`}
                    className="icon-button"
                    onClick={() => adjustWeight(-1)}
                    type="button"
                  >
                    <AppIcon name="decrease" size={20} />
                  </button>
                  <input
                    id={`set-weight-${exercise.itemId}`}
                    inputMode="decimal"
                    min="0.25"
                    onChange={(event) => setWeight(event.target.value)}
                    placeholder="—"
                    step="0.01"
                    type="number"
                    value={weight}
                  />
                  <button
                    aria-label={`Aumentar carga em ${formatWeight(weightStep)} kg`}
                    className="icon-button"
                    onClick={() => adjustWeight(1)}
                    type="button"
                  >
                    <AppIcon name="increase" size={20} />
                  </button>
                </div>
              </div>
            ) : null}
            {needsReps ? (
              <label>
                <span>Repetições</span>
                <input
                  inputMode="numeric"
                  max="1000"
                  min="1"
                  onChange={(event) => setReps(event.target.value)}
                  type="number"
                  value={reps}
                />
              </label>
            ) : null}
            {needsDuration ? (
              <label>
                <span>Tempo</span>
                <DurationInput
                  maximum={maximumExerciseDurationSeconds}
                  minimum={1}
                  onChange={setDurationSeconds}
                  required
                  seconds={durationSeconds}
                />
              </label>
            ) : null}
            {needsDistance ? (
              <label>
                <span>
                  Distância <small>metros</small>
                </span>
                <input
                  inputMode="numeric"
                  max="100000"
                  min="1"
                  onChange={(event) => setDistance(event.target.value)}
                  type="number"
                  value={distance}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {saveFailed ? (
          <p className="status-message status-error" role="alert">
            Não foi possível salvar agora. Tente novamente.
          </p>
        ) : null}

        {onAdjustPrevious ? (
          <button
            className="button-text set-completion-adjustment"
            disabled={busy}
            onClick={onAdjustPrevious}
            type="button"
          >
            Ajustar série anterior
          </button>
        ) : null}

        {hasKnownMeasure || missingMeasure ? (
          <button
            className="button-primary complete-set-button"
            disabled={busy || !canComplete}
            onClick={() => void saveSet()}
            type="button"
          >
            {busy ? "Salvando…" : "Salvar série"}
          </button>
        ) : null}
      </section>
    </div>
  );
}

const substitutionReasonLabels: Record<
  ExerciseSubstitutionInput["reason"],
  string
> = {
  comfort: "Mais confortável hoje",
  equipment_unavailable: "Equipamento indisponível",
  other: "Outro motivo",
  preference: "Preferência de execução",
};

function ExerciseSubstitutionDialog({
  busy,
  exercise,
  onClose,
  onConfirm,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onClose: () => void;
  onConfirm: (
    alternativeId: string,
    reason: ExerciseSubstitutionInput["reason"],
  ) => Promise<boolean>;
}>) {
  const [alternativeId, setAlternativeId] = useState(
    exercise.approvedAlternatives[0]?.alternativeId ?? "",
  );
  const [reason, setReason] = useState<ExerciseSubstitutionInput["reason"]>(
    "equipment_unavailable",
  );
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  async function confirm() {
    if (!alternativeId || busy) {
      return;
    }
    setFailed(false);
    if (!(await onConfirm(alternativeId, reason))) {
      setFailed(true);
    }
  }

  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-describedby="exercise-substitution-copy"
        aria-labelledby="exercise-substitution-title"
        aria-modal="true"
        className="session-dialog exercise-substitution-dialog"
        role="dialog"
      >
        <div className="guide-dialog-heading">
          <span className="guide-dialog-icon">
            <AppIcon name="swap" />
          </span>
          <h2 id="exercise-substitution-title">
            {exercise.approvedAlternatives.length > 0
              ? "Trocar exercício"
              : "Nenhuma alternativa aprovada"}
          </h2>
        </div>
        <p id="exercise-substitution-copy">
          {exercise.approvedAlternatives.length > 0
            ? `Escolha uma alternativa aprovada para ${exercise.plannedExerciseName}. Séries, repetições e descanso serão preservados.`
            : `O plano não possui uma alternativa aprovada para ${exercise.plannedExerciseName}. Continue com o exercício atual ou volte à lista.`}
        </p>
        {exercise.approvedAlternatives.length > 0 ? (
          <div className="exercise-substitution-fields">
            <label>
              <span>Alternativa</span>
              <select
                onChange={(event) => setAlternativeId(event.target.value)}
                value={alternativeId}
              >
                {exercise.approvedAlternatives.map((alternative) => (
                  <option
                    key={alternative.alternativeId}
                    value={alternative.alternativeId}
                  >
                    {alternative.exerciseName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Motivo</span>
              <select
                onChange={(event) =>
                  setReason(
                    event.target.value as ExerciseSubstitutionInput["reason"],
                  )
                }
                value={reason}
              >
                {Object.entries(substitutionReasonLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        ) : null}
        {failed ? (
          <p className="status-message status-error" role="alert">
            Não foi possível trocar agora. Tente novamente.
          </p>
        ) : null}
        <div className="session-dialog-actions">
          {exercise.approvedAlternatives.length > 0 ? (
            <button
              className="button-primary"
              disabled={busy || !alternativeId}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? "Trocando…" : "Confirmar troca"}
            </button>
          ) : null}
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            {exercise.approvedAlternatives.length > 0
              ? "Manter exercício"
              : "Entendi"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExerciseExecution({
  busy,
  exercise,
  onCompleteSet,
  onFinish,
  onReviseSet,
  onSkip,
  onStart,
  onSubstitute,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onCompleteSet: (
    input: Omit<SetCompletionInput, "itemId" | "runId">,
  ) => Promise<boolean>;
  onFinish?: () => void;
  onReviseSet: (request: SetRevisionRequest) => Promise<boolean>;
  onSkip?: () => void;
  onStart: () => void;
  onSubstitute: (
    alternativeId: string,
    reason: ExerciseSubstitutionInput["reason"],
  ) => Promise<boolean>;
}>) {
  const revisionTriggerRef = useRef<HTMLButtonElement>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const nextSet = exercise.setExecutions.length + 1;
  const lastSet = exercise.setExecutions.at(-1);
  const hasPlannedReps = exercise.repsMin !== null && exercise.repsMax !== null;
  const [missingMeasure, setMissingMeasure] = useState<
    MissingMeasure | undefined
  >(
    lastSet?.actualReps !== null && lastSet?.actualReps !== undefined
      ? "reps"
      : lastSet?.actualDurationSeconds !== null &&
          lastSet?.actualDurationSeconds !== undefined
        ? "duration"
        : undefined,
  );
  const needsReps = hasPlannedReps || missingMeasure === "reps";
  const needsDuration =
    exercise.durationSeconds !== null || missingMeasure === "duration";
  const needsDistance = exercise.distanceMeters !== null;
  const hasKnownMeasure = hasPlannedReps || needsDuration || needsDistance;
  const suggestedWeight = suggestedSetWeight(exercise, nextSet);
  const previousResult = referenceResult(exercise, nextSet);
  const [reps, setReps] = useState(
    hasPlannedReps
      ? String(exercise.repsMax)
      : lastSet?.actualReps !== null && lastSet?.actualReps !== undefined
        ? String(lastSet.actualReps)
        : "",
  );
  const [weight, setWeight] = useState(
    suggestedWeight !== null
      ? String(suggestedWeight)
      : lastSet?.actualWeightKg !== null &&
          lastSet?.actualWeightKg !== undefined
        ? String(lastSet.actualWeightKg)
        : "",
  );
  const [durationSeconds, setDurationSeconds] = useState<number | null>(
    exercise.durationSeconds ?? lastSet?.actualDurationSeconds ?? null,
  );
  const [distance, setDistance] = useState(
    exercise.distanceMeters !== null ? String(exercise.distanceMeters) : "",
  );
  const actualReps = needsReps ? parsedInteger(reps) : null;
  const actualWeightKg = weight ? parsedDecimal(weight) : null;
  const actualDurationSeconds = needsDuration ? durationSeconds : null;
  const actualDistanceMeters = needsDistance ? parsedInteger(distance) : null;
  const canComplete =
    nextSet <= exercise.sets &&
    (!needsReps || actualReps !== null) &&
    (!needsDuration || actualDurationSeconds !== null) &&
    (!needsDistance || actualDistanceMeters !== null);

  function closeRevisionFlow() {
    setRevisionOpen(false);
    window.requestAnimationFrame(() => revisionTriggerRef.current?.focus());
  }

  async function saveSetAndStartRest() {
    if (!canComplete || busy) {
      return;
    }
    setSaveFailed(false);
    const saved = await onCompleteSet({
      actualDistanceMeters,
      actualDurationSeconds,
      actualReps,
      actualWeightKg,
      setNumber: nextSet,
    });
    if (!saved) {
      setSaveFailed(true);
    }
  }

  if (exercise.completedAt) {
    return (
      <>
        <div className="exercise-completed-summary">
          <strong>Exercício concluído</strong>
          {exercise.setExecutions.length === 0 ? (
            <p>{exerciseTarget(exercise)}</p>
          ) : null}
        </div>
        {exercise.setExecutions.length > 0 || onFinish ? (
          <div className="exercise-control-bar">
            {exercise.setExecutions.length > 0 ? (
              <button
                aria-label="Ajustar ou desfazer série"
                className="exercise-control-action"
                disabled={busy}
                onClick={() => setRevisionOpen(true)}
                ref={revisionTriggerRef}
                type="button"
              >
                <span className="exercise-control-icon">
                  <AppIcon name="reset" size={26} />
                </span>
                <span>Ajustar</span>
              </button>
            ) : null}
            {onFinish ? (
              <FinishTrainingControl busy={busy} onFinish={onFinish} />
            ) : null}
          </div>
        ) : null}
        {revisionOpen ? (
          <SetRevisionFlow
            busy={busy}
            exercise={exercise}
            onClose={closeRevisionFlow}
            onRevise={onReviseSet}
          />
        ) : null}
      </>
    );
  }

  if (!exercise.startedAt) {
    return (
      <div className="exercise-start-state">
        <div
          aria-label="Espaço reservado para demonstração do exercício"
          className="exercise-media-placeholder exercise-media-ready"
          role="img"
        >
          <AppIcon name="workouts" size={52} />
        </div>
        <div className="exercise-current-set">
          <p className="exercise-series-label">Série 1 de {exercise.sets}</p>
          <p className="exercise-target">{currentSetTarget(exercise, 1)}</p>
          {exercise.substitution ? (
            <p className="exercise-substitution-note">
              No lugar de {exercise.substitution.plannedExerciseName}
            </p>
          ) : null}
        </div>
        <div className="exercise-control-bar">
          <button
            aria-label={`Iniciar ${exercise.exerciseName}`}
            className="exercise-control-action"
            data-primary="true"
            disabled={busy}
            onClick={onStart}
            type="button"
          >
            <span className="exercise-control-icon">
              <AppIcon name="play" size={27} />
            </span>
            <span>Iniciar</span>
          </button>
          {!exercise.substitution ? (
            <button
              aria-label={`Trocar ${exercise.plannedExerciseName}`}
              className="exercise-control-action"
              disabled={busy}
              onClick={() => setSubstitutionOpen(true)}
              type="button"
            >
              <span className="exercise-control-icon">
                <AppIcon name="swap" size={27} />
              </span>
              <span>Trocar</span>
            </button>
          ) : null}
          {onSkip ? (
            <button
              aria-label="Pular para o próximo exercício"
              className="exercise-control-action"
              disabled={busy}
              onClick={onSkip}
              type="button"
            >
              <span className="exercise-control-icon">
                <AppIcon name="skip" size={27} />
              </span>
              <span>Pular</span>
            </button>
          ) : null}
          {onFinish ? (
            <FinishTrainingControl busy={busy} onFinish={onFinish} />
          ) : null}
        </div>
        {substitutionOpen ? (
          <ExerciseSubstitutionDialog
            busy={busy}
            exercise={exercise}
            onClose={() => setSubstitutionOpen(false)}
            onConfirm={async (alternativeId, reason) => {
              const changed = await onSubstitute(alternativeId, reason);
              if (changed) {
                setSubstitutionOpen(false);
              }
              return changed;
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="exercise-active-state">
      <div
        className="exercise-media-placeholder exercise-executing-placeholder"
        role="status"
      >
        <span>Executando agora…</span>
      </div>
      <>
        <div className="exercise-metrics-grid">
          <div className="exercise-metric-field">
            <span>
              {needsDuration
                ? "Série e tempo"
                : needsDistance
                  ? "Série e distância"
                  : "Série e repetições"}
            </span>
            <strong>
              {nextSet} de {exercise.sets}
            </strong>
            {needsReps ? (
              <input
                aria-label="Repetições"
                inputMode="numeric"
                max="1000"
                min="1"
                onChange={(event) => setReps(event.target.value)}
                type="number"
                value={reps}
              />
            ) : null}
            {needsDuration ? (
              <DurationInput
                ariaLabel="Tempo"
                maximum={maximumExerciseDurationSeconds}
                minimum={1}
                onChange={setDurationSeconds}
                required
                seconds={durationSeconds}
              />
            ) : null}
            {needsDistance ? (
              <input
                aria-label="Distância em metros"
                inputMode="numeric"
                max="100000"
                min="1"
                onChange={(event) => setDistance(event.target.value)}
                type="number"
                value={distance}
              />
            ) : null}
            {!hasKnownMeasure && !missingMeasure ? (
              <span className="exercise-measure-choice">
                <button onClick={() => setMissingMeasure("reps")} type="button">
                  Repetições
                </button>
                <button
                  onClick={() => setMissingMeasure("duration")}
                  type="button"
                >
                  Tempo
                </button>
              </span>
            ) : null}
          </div>
          {exercise.modality === "strength" ? (
            <label className="exercise-metric-field">
              <span>Carga (kg)</span>
              <input
                aria-label="Carga kg"
                inputMode="decimal"
                min="0.25"
                onChange={(event) => setWeight(event.target.value)}
                placeholder="—"
                step="0.01"
                type="number"
                value={weight}
              />
            </label>
          ) : null}
        </div>
        {previousResult ? (
          <p className="exercise-previous-reference">
            Última vez · {previousResult.completedAt} · {previousResult.result}
          </p>
        ) : null}
        {exercise.substitution ? (
          <p className="exercise-substitution-note">
            No lugar de {exercise.substitution.plannedExerciseName}
          </p>
        ) : null}
        {saveFailed ? (
          <p className="status-message status-error" role="alert">
            Não foi possível salvar agora. Tente novamente.
          </p>
        ) : null}
        <div className="exercise-control-bar">
          {exercise.setExecutions.length > 0 ? (
            <button
              aria-label="Ajustar série anterior"
              className="exercise-control-action"
              disabled={busy}
              onClick={() => setRevisionOpen(true)}
              ref={revisionTriggerRef}
              type="button"
            >
              <span className="exercise-control-icon">
                <AppIcon name="reset" size={26} />
              </span>
              <span>Ajustar</span>
            </button>
          ) : null}
          {exercise.setExecutions.length === 0 && !exercise.substitution ? (
            <button
              aria-label={`Trocar ${exercise.plannedExerciseName}`}
              className="exercise-control-action"
              disabled={busy}
              onClick={() => setSubstitutionOpen(true)}
              type="button"
            >
              <span className="exercise-control-icon">
                <AppIcon name="swap" size={27} />
              </span>
              <span>Trocar</span>
            </button>
          ) : null}
          <button
            aria-label="Concluir série e iniciar descanso"
            className="exercise-control-action"
            data-primary="true"
            disabled={busy || !canComplete}
            onClick={() => void saveSetAndStartRest()}
            type="button"
          >
            <span className="exercise-control-icon">
              <AppIcon name="pause" size={27} />
            </span>
            <span>{busy ? "Salvando…" : "Concluir"}</span>
          </button>
          {onSkip ? (
            <button
              aria-label="Pular para o próximo exercício"
              className="exercise-control-action"
              disabled={busy}
              onClick={onSkip}
              type="button"
            >
              <span className="exercise-control-icon">
                <AppIcon name="skip" size={27} />
              </span>
              <span>Pular</span>
            </button>
          ) : null}
          {onFinish ? (
            <FinishTrainingControl busy={busy} onFinish={onFinish} />
          ) : null}
        </div>
      </>
      {revisionOpen ? (
        <SetRevisionFlow
          busy={busy}
          exercise={exercise}
          onClose={closeRevisionFlow}
          onRevise={onReviseSet}
        />
      ) : null}
      {substitutionOpen ? (
        <ExerciseSubstitutionDialog
          busy={busy}
          exercise={exercise}
          onClose={() => setSubstitutionOpen(false)}
          onConfirm={async (alternativeId, reason) => {
            const changed = await onSubstitute(alternativeId, reason);
            if (changed) {
              setSubstitutionOpen(false);
            }
            return changed;
          }}
        />
      ) : null}
    </div>
  );
}

function sessionError(reason: string) {
  if (reason === "conflict") {
    return "Atualize a sessão para continuar.";
  }
  if (reason === "invalid") {
    return "Este treino precisa ser revisado antes de continuar.";
  }
  return "Não foi possível salvar agora.";
}

function isLocalFirstGateway(
  candidate: TrainingSessionGateway,
): candidate is LocalFirstTrainingSessionGateway {
  return (
    "adjustRest" in candidate &&
    "dismissRest" in candidate &&
    "getSyncState" in candidate &&
    "resolveConflict" in candidate &&
    "subscribeSyncState" in candidate &&
    "synchronize" in candidate
  );
}

function subscribeToForegroundClock(update: () => void) {
  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  window.addEventListener("pageshow", update);
  return () => {
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("focus", update);
    window.removeEventListener("pageshow", update);
  };
}

function SyncConflictDialog({
  onClose,
  onRetry,
  onUseServer,
  pendingAction,
}: Readonly<{
  onClose: () => void;
  onRetry: () => void;
  onUseServer: () => void;
  pendingAction?: "retry" | "use-server";
}>) {
  const retryRef = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== undefined;

  useEffect(() => {
    retryRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div
      className="session-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="sync-conflict-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <h2 id="sync-conflict-title">Não foi possível sincronizar.</h2>
        <p>
          Seu treino continua salvo neste aparelho. Usar a versão online
          descarta as alterações pendentes.
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            disabled={busy}
            onClick={onRetry}
            ref={retryRef}
            type="button"
          >
            {pendingAction === "retry" ? "Tentando…" : "Tentar novamente"}
          </button>
          <button
            className="button-danger"
            disabled={busy}
            onClick={onUseServer}
            type="button"
          >
            {pendingAction === "use-server"
              ? "Carregando…"
              : "Usar versão online"}
          </button>
          <button
            className="button-text"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Voltar ao treino
          </button>
        </div>
      </section>
    </div>
  );
}

const exerciseSwipeTutorialKey = "daygym:exercise-swipe-tutorial:v1";

function ExerciseNavigationTutorial({
  onClose,
}: Readonly<{ onClose: () => void }>) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="exercise-navigation-title"
        aria-modal="true"
        className="session-dialog navigation-tutorial-dialog"
        role="dialog"
      >
        <h2 id="exercise-navigation-title">Navegue com um gesto.</h2>
        <p>Deslize para os lados para trocar de exercício.</p>
        <button
          className="button-primary"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          Entendi
        </button>
      </section>
    </div>
  );
}

function syncStatusLabel(
  syncState: TrainingSessionSyncState,
  busy: boolean,
  paused: boolean,
) {
  if (paused) {
    return "Pausado";
  }
  if (busy) {
    return "Salvando…";
  }
  if (syncState.status === "syncing") {
    return "Sincronizando…";
  }
  if (syncState.status === "conflict") {
    return "Sincronização bloqueada";
  }
  if (syncState.status === "offline" && syncState.pendingCount > 0) {
    return "Salvo neste aparelho";
  }
  if (syncState.status === "offline") {
    return "Offline";
  }
  if (syncState.status === "pending") {
    return "Sincronização pendente";
  }
  return "Sincronizado";
}

const restVibrationPreferenceKey = "daygym:rest-vibration";

function RestTimer({
  canAddTime,
  compact = false,
  endsAt,
  finishBusy = false,
  nextLabel,
  onAddTime,
  onComplete,
  onFinish,
  onOpen,
}: Readonly<{
  canAddTime: boolean;
  compact?: boolean;
  endsAt: string;
  finishBusy?: boolean;
  nextLabel?: string;
  onAddTime: () => void;
  onComplete: () => void;
  onFinish?: () => void;
  onOpen?: () => void;
}>) {
  const notifiedRef = useRef(false);
  function currentRemainingSeconds() {
    return Math.max(
      0,
      Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1_000),
    );
  }

  const [remainingSeconds, setRemainingSeconds] = useState(
    currentRemainingSeconds,
  );
  const [vibrationSupported, setVibrationSupported] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(false);

  useEffect(() => {
    const supported = typeof navigator.vibrate === "function";
    setVibrationSupported(supported);
    if (supported) {
      try {
        setVibrationEnabled(
          window.localStorage.getItem(restVibrationPreferenceKey) === "true",
        );
      } catch {
        setVibrationEnabled(false);
      }
    }
  }, []);

  useEffect(() => {
    function updateRemaining() {
      setRemainingSeconds(currentRemainingSeconds());
    }
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1_000);
    const unsubscribe = subscribeToForegroundClock(updateRemaining);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [endsAt]);

  useEffect(() => {
    if (remainingSeconds <= 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      if (vibrationEnabled && typeof navigator.vibrate === "function") {
        navigator.vibrate([180, 80, 180]);
      }
      onComplete();
    }
  }, [onComplete, remainingSeconds, vibrationEnabled]);

  function toggleVibration() {
    const enabled = !vibrationEnabled;
    setVibrationEnabled(enabled);
    try {
      window.localStorage.setItem(restVibrationPreferenceKey, String(enabled));
    } catch {
      // The in-memory preference still works when storage is unavailable.
    }
    if (enabled) {
      navigator.vibrate?.(30);
    }
  }

  const formatted = formatClock(remainingSeconds);
  if (compact) {
    return (
      <button
        aria-label={`Voltar ao descanso, ${formatted} restantes`}
        className="rest-mini-timer"
        onClick={onOpen}
        type="button"
      >
        <span>Descanso</span>
        <time dateTime={`PT${remainingSeconds}S`}>{formatted}</time>
      </button>
    );
  }

  return (
    <section aria-labelledby="rest-title" className="exercise-rest-screen">
      <div className="exercise-rest-copy">
        <p>Descanso</p>
        <time
          aria-live="polite"
          dateTime={`PT${remainingSeconds}S`}
          id="rest-title"
        >
          {formatted}
        </time>
        {nextLabel ? <span>{nextLabel}</span> : null}
      </div>
      <div className="exercise-control-bar exercise-rest-controls">
        <button
          aria-label="Adicionar 30 segundos"
          className="exercise-control-action"
          disabled={!canAddTime}
          onClick={onAddTime}
          type="button"
        >
          <span className="exercise-control-icon exercise-control-time">
            +30
          </span>
          <span>Tempo</span>
        </button>
        <button
          aria-label="Concluir descanso e continuar"
          className="exercise-control-action"
          data-primary="true"
          onClick={onComplete}
          type="button"
        >
          <span className="exercise-control-icon">
            <AppIcon name="play" size={27} />
          </span>
          <span>Continuar</span>
        </button>
        {onFinish ? (
          <FinishTrainingControl busy={finishBusy} onFinish={onFinish} />
        ) : null}
      </div>
      {vibrationSupported ? (
        <button
          aria-label={`Vibração ao terminar: ${
            vibrationEnabled ? "ativada" : "desativada"
          }`}
          aria-pressed={vibrationEnabled}
          className="exercise-rest-vibration"
          data-enabled={vibrationEnabled ? "true" : undefined}
          onClick={toggleVibration}
          type="button"
        >
          {vibrationEnabled ? "Vibração ativada" : "Ativar vibração"}
        </button>
      ) : null}
    </section>
  );
}

function FinishTrainingControl({
  busy,
  onFinish,
}: Readonly<{ busy: boolean; onFinish: () => void }>) {
  return (
    <button
      aria-label="Finalizar treino"
      className="exercise-control-action"
      disabled={busy}
      onClick={onFinish}
      type="button"
    >
      <span className="exercise-control-icon">
        <AppIcon name="exit" size={27} />
      </span>
      <span>{busy ? "Finalizando…" : "Finalizar"}</span>
    </button>
  );
}

function PauseTrainingDialog({
  onClose,
  onCancel,
  onConfirm,
  onRestart,
  pendingAction,
}: Readonly<{
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRestart: () => void;
  pendingAction?: "cancel" | "pause" | "restart";
}>) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== undefined;

  useEffect(() => {
    confirmRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div
      className="session-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="pause-training-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <h2 id="pause-training-title">O que fazer com este treino?</h2>
        <p>
          Pausar mantém seu progresso. Recomeçar apaga as séries e inicia este
          treino do zero. Cancelar apaga esta execução sem salvar no histórico.
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {pendingAction === "pause" ? "Pausando…" : "Pausar treino"}
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onRestart}
            type="button"
          >
            {pendingAction === "restart" ? "Recomeçando…" : "Recomeçar do zero"}
          </button>
          <button
            className="button-danger"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {pendingAction === "cancel" ? "Cancelando…" : "Cancelar treino"}
          </button>
          <button
            className="button-text"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Continuar treino
          </button>
        </div>
      </section>
    </div>
  );
}

export function ActiveTrainingScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
  plannedSessionId,
}: ActiveTrainingScreenProps) {
  const gatewayRef = useRef<TrainingSessionGateway | undefined>(
    providedGateway,
  );
  const [state, setState] = useState<PracticalTrainingState>();
  const [syncState, setSyncState] = useState<TrainingSessionSyncState>({
    lastSyncedAt: null,
    pendingCount: 0,
    status: "synced",
  });
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictAction, setConflictAction] = useState<
    "retry" | "use-server"
  >();
  const syncRefreshAtRef = useRef<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionView, setSessionView] = useState<"list" | "exercise">("list");
  const [busy, setBusy] = useState(false);
  const [dialogAction, setDialogAction] = useState<
    "cancel" | "pause" | "restart"
  >();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [partialFinishDialogOpen, setPartialFinishDialogOpen] = useState(false);
  const [navigationTutorialOpen, setNavigationTutorialOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [finishedSummary, setFinishedSummary] =
    useState<FinishedTrainingSummary>();
  const listScrollYRef = useRef(0);
  const restoreListScrollRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const tutorialRunRef = useRef<string | null>(null);

  function gateway() {
    gatewayRef.current ??= createLocalFirstTrainingSessionGateway();
    return gatewayRef.current;
  }

  async function refresh(preferredSessionId?: string) {
    const result = await gateway().load(preferredSessionId);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return null;
      }
      setError(sessionError(result.reason));
      return null;
    }
    setState(result.value);
    return result.value;
  }

  useEffect(() => {
    let active = true;
    const requestedSessionId =
      plannedSessionId ??
      new URLSearchParams(window.location.search).get("sessao") ??
      undefined;
    void gateway()
      .load(requestedSessionId)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result.ok) {
          if (result.reason === "session") {
            navigate("/entrar/");
            return;
          }
          setError(sessionError(result.reason));
          return;
        }
        setState(result.value);
        const firstPending = result.value.activeRun?.session.items.findIndex(
          (item) => !item.completedAt,
        );
        setSelectedIndex(
          firstPending !== undefined && firstPending >= 0 ? firstPending : 0,
        );
      });
    return () => {
      active = false;
    };
  }, [navigate, plannedSessionId]);

  useEffect(() => {
    const activeRun = state?.activeRun;
    if (
      !activeRun ||
      sessionView !== "exercise" ||
      state.activeRest ||
      activeRun.session.items.length < 2 ||
      tutorialRunRef.current === activeRun.runId
    ) {
      return;
    }
    tutorialRunRef.current = activeRun.runId;
    try {
      if (window.localStorage.getItem(exerciseSwipeTutorialKey) === "seen") {
        return;
      }
    } catch {
      // The tutorial still works when storage is unavailable.
    }
    setNavigationTutorialOpen(true);
  }, [sessionView, state?.activeRest, state?.activeRun]);

  function closeNavigationTutorial() {
    try {
      window.localStorage.setItem(exerciseSwipeTutorialKey, "seen");
    } catch {
      // Dismissing remains possible when storage is unavailable.
    }
    setNavigationTutorialOpen(false);
  }

  useEffect(() => {
    const currentGateway = gateway();
    if (!isLocalFirstGateway(currentGateway)) {
      return;
    }

    let active = true;
    let observedPendingWork = false;
    const unsubscribe = currentGateway.subscribeSyncState((nextSyncState) => {
      if (!active) {
        return;
      }
      setSyncState(nextSyncState);
      if (
        nextSyncState.pendingCount > 0 ||
        nextSyncState.status === "pending" ||
        nextSyncState.status === "syncing"
      ) {
        observedPendingWork = true;
      }
      if (
        observedPendingWork &&
        nextSyncState.status === "synced" &&
        nextSyncState.lastSyncedAt &&
        syncRefreshAtRef.current !== nextSyncState.lastSyncedAt
      ) {
        observedPendingWork = false;
        syncRefreshAtRef.current = nextSyncState.lastSyncedAt;
        void currentGateway.load().then((result) => {
          if (active && result.ok) {
            setState(result.value);
          }
        });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function startTraining(exerciseIndex: number) {
    if (!state?.nextSession || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().start(state.nextSession.sessionId);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    setState((current) =>
      current
        ? {
            ...current,
            activeRun: result.value,
            nextSession: result.value.session,
          }
        : current,
    );
    setSelectedIndex(exerciseIndex);
    setSessionView("exercise");
  }

  function openExercise(exerciseIndex: number) {
    listScrollYRef.current =
      window.scrollY || document.documentElement.scrollTop;
    if (state?.activeRun) {
      setSelectedIndex(exerciseIndex);
      setSessionView("exercise");
      return;
    }
    void startTraining(exerciseIndex);
  }

  function returnToExerciseList() {
    restoreListScrollRef.current = true;
    setSessionView("list");
  }

  useEffect(() => {
    if (sessionView === "exercise") {
      setDocumentScrollTop(0);
      return;
    }
    if (restoreListScrollRef.current) {
      restoreListScrollRef.current = false;
      setDocumentScrollTop(listScrollYRef.current);
    }
  }, [sessionView]);

  async function startCurrentExercise() {
    const run = state?.activeRun;
    const currentExercise = run?.session.items[selectedIndex];
    if (
      !run ||
      run.pausedAt ||
      !currentExercise ||
      currentExercise.completedAt ||
      currentExercise.startedAt ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().startExercise(
      run.runId,
      currentExercise.itemId,
    );
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    await refresh();
    setBusy(false);
  }

  async function completeCurrentSet(
    input: Omit<SetCompletionInput, "itemId" | "runId">,
  ) {
    const run = state?.activeRun;
    const currentExercise = run?.session.items[selectedIndex];
    if (
      !run ||
      run.pausedAt ||
      !currentExercise ||
      currentExercise.completedAt ||
      busy
    ) {
      return false;
    }
    setBusy(true);
    setError(undefined);
    const completionInput = {
      ...input,
      itemId: currentExercise.itemId,
      runId: run.runId,
    };
    const result = await gateway().completeSet(completionInput);
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "session") {
        navigate("/entrar/");
        return false;
      }
      setError(sessionError(result.reason));
      return false;
    }
    const nextState = applyCompletedTrainingSetWithRest(
      state,
      completionInput,
      result.value,
    );
    setState(nextState);
    setBusy(false);
    const nextItems = nextState.activeRun?.session.items;
    const firstPending = nextItems?.findIndex((item) => !item.completedAt);
    if (result.value.exerciseCompleted) {
      if (firstPending !== undefined && firstPending >= 0) {
        setSelectedIndex(firstPending);
      }
      setSessionView("list");
      return true;
    }
    if (nextState.activeRest) {
      return true;
    }
    return true;
  }

  async function substituteCurrentExercise(
    alternativeId: string,
    reason: ExerciseSubstitutionInput["reason"],
  ) {
    const run = state?.activeRun;
    const currentExercise = run?.session.items[selectedIndex];
    if (
      !run ||
      run.pausedAt ||
      !currentExercise ||
      currentExercise.completedAt ||
      currentExercise.setExecutions.length > 0 ||
      currentExercise.substitution ||
      busy
    ) {
      return false;
    }
    const input: ExerciseSubstitutionInput = {
      alternativeId,
      itemId: currentExercise.itemId,
      reason,
      runId: run.runId,
    };
    setBusy(true);
    setError(undefined);
    const currentGateway = gateway();
    if (!currentGateway.substituteExercise) {
      setBusy(false);
      setError("A substituição ainda não está disponível neste dispositivo.");
      return false;
    }
    const result = await currentGateway.substituteExercise(input);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return false;
      }
      setError(sessionError(result.reason));
      return false;
    }
    setState((current) =>
      current
        ? applyExerciseSubstitution(current, input, result.value)
        : current,
    );
    return true;
  }

  async function completeRest() {
    const restState = state?.activeRest;
    if (!restState) {
      return;
    }
    const nextExerciseIndex = state.activeRun?.session.items.findIndex(
      (item) => item.itemId === restState.nextItemId,
    );
    if (nextExerciseIndex !== undefined && nextExerciseIndex >= 0) {
      setSelectedIndex(nextExerciseIndex);
    }
    setState((current) =>
      current ? { ...current, activeRest: null } : current,
    );
    const currentGateway = gateway();
    if (isLocalFirstGateway(currentGateway)) {
      const result = await currentGateway.dismissRest(restState.runId);
      if (!result.ok) {
        setError(sessionError(result.reason));
      }
    }
  }

  async function addRestTime() {
    const restState = state?.activeRest;
    if (!restState || restState.durationSeconds >= 1_800) {
      return;
    }
    const currentGateway = gateway();
    if (isLocalFirstGateway(currentGateway)) {
      const result = await currentGateway.adjustRest(restState.runId, 30);
      if (!result.ok) {
        setError(sessionError(result.reason));
        return;
      }
      setState(result.value);
      return;
    }
    setState((current) => {
      const activeRest = current?.activeRest;
      if (!current || !activeRest || activeRest.runId !== restState.runId) {
        return current;
      }
      const appliedSeconds = Math.min(30, 1_800 - activeRest.durationSeconds);
      return {
        ...current,
        activeRest: {
          ...activeRest,
          durationSeconds: activeRest.durationSeconds + appliedSeconds,
          endsAt: new Date(
            new Date(activeRest.endsAt).getTime() + appliedSeconds * 1_000,
          ).toISOString(),
        },
      };
    });
  }

  async function synchronizeNow() {
    const currentGateway = gateway();
    if (isLocalFirstGateway(currentGateway)) {
      await currentGateway.synchronize();
    }
  }

  async function resolveSyncConflict(resolution: "retry" | "use-server") {
    const currentGateway = gateway();
    if (!isLocalFirstGateway(currentGateway)) {
      return;
    }
    setConflictAction(resolution);
    setError(undefined);
    const result = await currentGateway.resolveConflict(resolution);
    setConflictAction(undefined);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    setState(result.value);
    setConflictDialogOpen(false);
  }

  async function reviseCurrentSet(request: SetRevisionRequest) {
    const run = state?.activeRun;
    const currentExercise = run?.session.items[selectedIndex];
    if (!run || run.pausedAt || !currentExercise || busy) {
      return false;
    }

    const identity = {
      expectedRevision: request.set.revision,
      itemId: currentExercise.itemId,
      runId: run.runId,
      setExecutionId: request.set.setExecutionId,
      setNumber: request.set.setNumber,
    };
    const input: SetRevisionInput =
      request.action === "correct"
        ? {
            ...identity,
            action: "correct",
            actualDistanceMeters: request.actualDistanceMeters,
            actualDurationSeconds: request.actualDurationSeconds,
            actualReps: request.actualReps,
            actualWeightKg: request.actualWeightKg,
          }
        : { ...identity, action: "undo" };

    setBusy(true);
    setError(undefined);
    const result = await gateway().reviseSet(input);
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "session") {
        navigate("/entrar/");
        return false;
      }
      setError(sessionError(result.reason));
      return false;
    }

    const refreshed = await refresh();
    setBusy(false);
    return refreshed !== null;
  }

  async function finishTraining(
    completionStatus: TrainingCompletionStatus = "complete",
  ) {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().finish(run.runId, completionStatus);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    setPartialFinishDialogOpen(false);
    setFinishedSummary(trainingSummary(run, result.value));
  }

  async function pauseTraining() {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setDialogAction("pause");
    setError(undefined);
    const result = await gateway().pause(run.runId);
    setBusy(false);
    setDialogAction(undefined);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      setPauseDialogOpen(false);
      return;
    }
    navigate("/treinos/");
  }

  async function restartTraining() {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    const plannedSessionId = run.session.sessionId;
    setBusy(true);
    setDialogAction("restart");
    setError(undefined);

    const cancelled = await gateway().cancel(run.runId);
    if (!cancelled.ok) {
      setBusy(false);
      setDialogAction(undefined);
      setPauseDialogOpen(false);
      if (cancelled.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(cancelled.reason));
      return;
    }

    const restarted = await gateway().start(plannedSessionId);
    setBusy(false);
    setDialogAction(undefined);
    setPauseDialogOpen(false);
    if (!restarted.ok) {
      await refresh(plannedSessionId);
      if (restarted.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(restarted.reason));
      return;
    }

    setState((current) =>
      current
        ? {
            ...current,
            activeRun: restarted.value,
            nextSession: restarted.value.session,
          }
        : current,
    );
    setSelectedIndex(0);
    setSessionView("list");
  }

  async function cancelTraining() {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setDialogAction("cancel");
    setError(undefined);

    const result = await gateway().cancel(run.runId);
    setBusy(false);
    setDialogAction(undefined);
    setPauseDialogOpen(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }

    navigate("/treinos/");
  }

  async function resumeTraining() {
    const run = state?.activeRun;
    if (!run?.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().resume(run.runId);
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    await refresh();
    setBusy(false);
  }

  if (finishedSummary) {
    return (
      <main className="session-shell session-finished">
        <p className="eyebrow">Treino salvo</p>
        <h1>
          {finishedSummary.completionStatus === "partial"
            ? "Treino concluído parcialmente."
            : "Treino concluído."}
        </h1>
        <dl className="training-summary">
          <div className="training-summary-highlight">
            <dt>Duração</dt>
            <dd>{formatTrainingDuration(finishedSummary.durationSeconds)}</dd>
          </div>
          {finishedSummary.completionStatus === "partial" ? (
            <div>
              <dt>Pendentes</dt>
              <dd>
                {finishedSummary.plannedSets - finishedSummary.completedSets}{" "}
                {finishedSummary.plannedSets - finishedSummary.completedSets ===
                1
                  ? "série"
                  : "séries"}
              </dd>
            </div>
          ) : null}
          <div className="training-summary-highlight">
            <dt>Aderência</dt>
            <dd>
              <span>{finishedSummary.adherencePercent}%</span>
              <small>
                {finishedSummary.completedSets} de {finishedSummary.plannedSets}{" "}
                {finishedSummary.plannedSets === 1 ? "série" : "séries"}
              </small>
            </dd>
          </div>
          {finishedSummary.volumeKg > 0 ? (
            <div>
              <dt>Volume</dt>
              <dd>{formatWeight(finishedSummary.volumeKg)} kg</dd>
            </div>
          ) : null}
          {finishedSummary.recordedDurationSeconds > 0 ? (
            <div>
              <dt>Tempo registrado</dt>
              <dd>
                {formatTrainingDuration(
                  finishedSummary.recordedDurationSeconds,
                )}
              </dd>
            </div>
          ) : null}
          {finishedSummary.distanceMeters > 0 ? (
            <div>
              <dt>Distância</dt>
              <dd>{finishedSummary.distanceMeters} m</dd>
            </div>
          ) : null}
        </dl>
        {finishedSummary.substitutions.length > 0 ? (
          <section
            aria-labelledby="training-summary-substitutions"
            className="training-summary-substitutions"
          >
            <h2 id="training-summary-substitutions">Exercícios substituídos</h2>
            <ul>
              {finishedSummary.substitutions.map((substitution) => (
                <li
                  key={`${substitution.plannedExerciseName}:${substitution.exerciseName}`}
                >
                  <strong>{substitution.exerciseName}</strong>
                  <span>No lugar de {substitution.plannedExerciseName}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {syncState.pendingCount > 0 ? (
          <p className="training-summary-sync" role="status">
            Salvo neste aparelho · sincronização pendente
          </p>
        ) : null}
        <Link className="button-primary" href="/hoje/">
          Voltar para Hoje
        </Link>
      </main>
    );
  }

  if (!state && !error) {
    return (
      <main className="session-shell">
        <AppLoadingSkeleton label="Carregando treino" />
      </main>
    );
  }

  if (!state || !state.plan || !state.nextSession) {
    return (
      <main className="session-shell session-empty">
        <p className="eyebrow">Treinos</p>
        <h1>{error ?? "Nenhum treino disponível."}</h1>
        <Link className="button-secondary" href="/treinos/">
          Voltar para Treinos
        </Link>
      </main>
    );
  }

  if (!state.activeRun) {
    const plannedSetCount = state.nextSession.items.reduce(
      (total, item) => total + item.sets,
      0,
    );
    return (
      <main className="session-shell session-overview session-workout-list">
        <header className="session-topbar">
          <Link
            aria-label="Voltar"
            className="session-back-action"
            href="/treinos/"
          >
            <AppIcon name="back" size={30} />
          </Link>
        </header>
        <section className="workout-list-heading">
          <p className="eyebrow">
            {trainingWeekdayName(state.nextSession.weekday)}
          </p>
          <h1>{state.nextSession.name}</h1>
          <progress
            aria-label={`Progresso do treino: 0 de ${plannedSetCount} séries`}
            max={Math.max(1, plannedSetCount)}
            value={0}
          />
        </section>
        <ol className="workout-exercise-list" aria-label="Exercícios do treino">
          {state.nextSession.items.map((exercise, index) => (
            <li key={exercise.itemId}>
              <button
                aria-label={`Começar por ${exercise.exerciseName}`}
                disabled={busy}
                onClick={() => openExercise(index)}
                type="button"
              >
                <span className="workout-exercise-order">{exercise.order}</span>
                <span className="workout-exercise-copy">
                  <strong>{exercise.exerciseName}</strong>
                  <small>{exerciseTarget(exercise)}</small>
                  <small>{formatClock(exercise.restSeconds)} de descanso</small>
                </span>
                <AppIcon name="forward" size={22} />
              </button>
            </li>
          ))}
        </ol>
        {busy ? (
          <p className="workout-list-status" role="status">
            Iniciando treino…
          </p>
        ) : null}
        {error ? (
          <p className="status-message status-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  const run = state.activeRun;
  const completedCount = run.session.items.filter(
    (item) => item.completedAt,
  ).length;
  const allCompleted = completedCount === run.session.items.length;
  const plannedSetCount = run.session.items.reduce(
    (total, item) => total + item.sets,
    0,
  );
  const progressMax = Math.max(1, plannedSetCount);
  const completedSetCount = run.session.items.reduce(
    (total, item) => total + item.setExecutions.length,
    0,
  );
  const progressValue = allCompleted ? plannedSetCount : completedSetCount;
  const currentExercise =
    run.session.items[selectedIndex] ?? run.session.items[0];
  const nextPendingIndex = run.session.items.findIndex(
    (item, index) => index > selectedIndex && !item.completedAt,
  );
  const wrappedPendingIndex = run.session.items.findIndex(
    (item, index) => index !== selectedIndex && !item.completedAt,
  );
  const skipIndex =
    nextPendingIndex >= 0 ? nextPendingIndex : wrappedPendingIndex;
  const restNextItem = state.activeRest
    ? run.session.items.find(
        (item) => item.itemId === state.activeRest?.nextItemId,
      )
    : undefined;
  const restNextLabel = state.activeRest
    ? state.activeRest.nextItemId === state.activeRest.sourceItemId
      ? "Próxima série"
      : restNextItem
        ? `Próximo · ${restNextItem.exerciseName}`
        : undefined
    : undefined;
  const syncLabel = syncStatusLabel(syncState, busy, Boolean(run.pausedAt));
  const syncVisualStatus = busy || run.pausedAt ? "pending" : syncState.status;

  function requestTrainingFinish() {
    if (allCompleted) {
      void finishTraining("complete");
    } else {
      setPartialFinishDialogOpen(true);
    }
  }

  function moveBetweenExercises(direction: -1 | 1) {
    if (busy || state?.activeRest) {
      return;
    }
    setSelectedIndex((current) =>
      Math.min(run.session.items.length - 1, Math.max(0, current + direction)),
    );
  }

  return (
    <main
      className={`session-shell session-active ${
        sessionView === "list"
          ? "session-workout-list"
          : "session-exercise-detail"
      }`}
    >
      <header className="session-topbar">
        {sessionView === "exercise" && !run.pausedAt ? (
          <button
            aria-label="Voltar para a lista de exercícios"
            className="session-pause-action"
            disabled={busy}
            onClick={returnToExerciseList}
            type="button"
          >
            <AppIcon name="back" size={30} />
          </button>
        ) : run.pausedAt ? (
          <Link
            aria-label="Voltar"
            className="session-back-action"
            href="/treinos/"
          >
            <AppIcon name="back" size={30} />
          </Link>
        ) : (
          <button
            aria-label="Voltar"
            className="session-pause-action"
            disabled={busy}
            onClick={() => setPauseDialogOpen(true)}
            type="button"
          >
            <AppIcon name="back" size={30} />
          </button>
        )}
        {sessionView === "exercise" && currentExercise ? (
          <h1 className="session-exercise-title">
            {state.activeRest ? "Descanso" : currentExercise.exerciseName}
          </h1>
        ) : null}
        {syncState.status === "conflict" ? (
          <button
            aria-label="Resolver sincronização bloqueada"
            className="session-sync-indicator"
            data-sync-status={syncVisualStatus}
            onClick={() => setConflictDialogOpen(true)}
            type="button"
          />
        ) : syncState.pendingCount > 0 ? (
          <button
            aria-label={`${syncLabel}. Sincronizar ${syncState.pendingCount} ${
              syncState.pendingCount === 1
                ? "registro pendente"
                : "registros pendentes"
            }`}
            className="session-sync-indicator"
            data-sync-status={syncVisualStatus}
            disabled={syncState.status === "syncing"}
            onClick={() => void synchronizeNow()}
            type="button"
          />
        ) : (
          <span
            aria-label={syncLabel}
            className="session-sync-indicator"
            data-sync-status={syncVisualStatus}
            role="status"
          />
        )}
      </header>

      {sessionView === "list" ? (
        <section className="workout-list-content">
          {run.pausedAt ? (
            <section className="resume-training" aria-labelledby="resume-title">
              <div>
                <p className="eyebrow">Treino pausado</p>
                <h2 id="resume-title">Continue de onde parou.</h2>
              </div>
              <button
                className="button-primary"
                disabled={busy}
                onClick={() => void resumeTraining()}
                type="button"
              >
                {busy ? "Retomando…" : "Retomar treino"}
              </button>
            </section>
          ) : null}
          <div className="workout-list-heading">
            <p className="eyebrow">Treino em andamento</p>
            <h1>{run.session.name}</h1>
            <progress
              aria-label={`Progresso do treino: ${progressValue} de ${plannedSetCount} séries`}
              max={progressMax}
              value={progressValue}
            />
          </div>
          <ol
            className="workout-exercise-list"
            aria-label="Exercícios do treino"
          >
            {run.session.items.map((exercise, index) => (
              <li
                data-completed={exercise.completedAt ? "true" : undefined}
                key={exercise.itemId}
              >
                <button
                  aria-label={`Abrir ${exercise.exerciseName}`}
                  disabled={busy || Boolean(run.pausedAt)}
                  onClick={() => openExercise(index)}
                  type="button"
                >
                  <span className="workout-exercise-order">
                    {exercise.completedAt ? (
                      <AppIcon name="check" size={20} />
                    ) : (
                      exercise.order
                    )}
                  </span>
                  <span className="workout-exercise-copy">
                    <strong>{exercise.exerciseName}</strong>
                    {exercise.substitution ? (
                      <small>
                        No lugar de {exercise.substitution.plannedExerciseName}
                      </small>
                    ) : null}
                    <small>{exerciseTarget(exercise)}</small>
                    <small>
                      {formatClock(exercise.restSeconds)} de descanso
                    </small>
                  </span>
                  <span className="workout-exercise-progress">
                    {exercise.setExecutions.length}/{exercise.sets}
                  </span>
                  <AppIcon name="forward" size={22} />
                </button>
              </li>
            ))}
          </ol>
          {completedSetCount > 0 && !run.pausedAt ? (
            <div className="exercise-control-bar workout-list-controls">
              <FinishTrainingControl
                busy={busy}
                onFinish={requestTrainingFinish}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {sessionView === "exercise" && !run.pausedAt && currentExercise ? (
        <section
          aria-label={
            state.activeRest
              ? `Descanso, ${restNextLabel ?? "continue quando estiver pronto"}`
              : `${currentExercise.exerciseName}, série ${Math.min(
                  currentExercise.setExecutions.length + 1,
                  currentExercise.sets,
                )} de ${currentExercise.sets}`
          }
          aria-describedby="exercise-swipe-hint"
          className="current-exercise"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveBetweenExercises(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              moveBetweenExercises(1);
            }
          }}
          onTouchEnd={(event) => {
            const start = swipeStartRef.current;
            const touch = event.changedTouches[0];
            swipeStartRef.current = null;
            if (!start || !touch) {
              return;
            }
            const distanceX = touch.clientX - start.x;
            const distanceY = touch.clientY - start.y;
            if (
              Math.abs(distanceX) < 56 ||
              Math.abs(distanceX) <= Math.abs(distanceY) * 1.2
            ) {
              return;
            }
            moveBetweenExercises(distanceX < 0 ? 1 : -1);
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            swipeStartRef.current = touch
              ? { x: touch.clientX, y: touch.clientY }
              : null;
          }}
          tabIndex={0}
        >
          <progress
            aria-label={`Progresso do treino: ${progressValue} de ${plannedSetCount} séries`}
            className="current-exercise-progress"
            max={progressMax}
            value={progressValue}
          />
          <p className="sr-only" id="exercise-swipe-hint">
            Deslize para os lados para trocar de exercício. No teclado, use as
            setas esquerda e direita.
          </p>
          {state.activeRest ? (
            <RestTimer
              canAddTime={state.activeRest.durationSeconds < 1_800}
              endsAt={state.activeRest.endsAt}
              finishBusy={busy}
              nextLabel={restNextLabel}
              onAddTime={() => void addRestTime()}
              onComplete={() => void completeRest()}
              onFinish={
                completedSetCount > 0 ? requestTrainingFinish : undefined
              }
            />
          ) : (
            <ExerciseExecution
              busy={busy}
              exercise={currentExercise}
              key={`${currentExercise.itemId}:${currentExercise.setExecutions.length}:${currentExercise.startedAt ?? "pending"}`}
              onCompleteSet={completeCurrentSet}
              onFinish={
                completedSetCount > 0 ? requestTrainingFinish : undefined
              }
              onReviseSet={reviseCurrentSet}
              onSkip={
                skipIndex >= 0 ? () => setSelectedIndex(skipIndex) : undefined
              }
              onStart={() => void startCurrentExercise()}
              onSubstitute={substituteCurrentExercise}
            />
          )}
        </section>
      ) : null}

      {error ? (
        <p className="status-message status-error" role="alert">
          {error}
        </p>
      ) : null}

      {pauseDialogOpen ? (
        <PauseTrainingDialog
          onClose={() => setPauseDialogOpen(false)}
          onCancel={() => void cancelTraining()}
          onConfirm={() => void pauseTraining()}
          onRestart={() => void restartTraining()}
          pendingAction={dialogAction}
        />
      ) : null}
      {partialFinishDialogOpen ? (
        <PartialTrainingDialog
          busy={busy}
          completedSets={completedSetCount}
          onClose={() => setPartialFinishDialogOpen(false)}
          onConfirm={() => void finishTraining("partial")}
          onReview={() => {
            const firstPendingIndex = run.session.items.findIndex(
              (item) => item.setExecutions.length < item.sets,
            );
            if (firstPendingIndex >= 0) {
              setSelectedIndex(firstPendingIndex);
            }
            setSessionView("list");
            setPartialFinishDialogOpen(false);
          }}
          plannedSets={plannedSetCount}
        />
      ) : null}
      {conflictDialogOpen ? (
        <SyncConflictDialog
          onClose={() => setConflictDialogOpen(false)}
          onRetry={() => void resolveSyncConflict("retry")}
          onUseServer={() => void resolveSyncConflict("use-server")}
          pendingAction={conflictAction}
        />
      ) : null}
      {navigationTutorialOpen ? (
        <ExerciseNavigationTutorial onClose={closeNavigationTutorial} />
      ) : null}
      {state?.activeRest && sessionView === "list" ? (
        <RestTimer
          canAddTime={state.activeRest.durationSeconds < 1_800}
          compact
          endsAt={state.activeRest.endsAt}
          onAddTime={() => void addRestTime()}
          onComplete={() => void completeRest()}
          onOpen={() => setSessionView("exercise")}
        />
      ) : null}
    </main>
  );
}
