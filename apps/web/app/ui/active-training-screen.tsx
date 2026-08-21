"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ActiveTrainingRun,
  LocalFirstTrainingSessionGateway,
  PracticalTrainingExercise,
  PracticalTrainingSet,
  PracticalTrainingState,
  SetCompletionInput,
  SetRevisionInput,
  TrainingSessionGateway,
  TrainingSessionSyncState,
} from "@daygym/contracts";

import { createLocalFirstTrainingSessionGateway } from "../../lib/local-first-training-session-gateway";
import { applyCompletedTrainingSetWithRest } from "../../lib/training-session-state";
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
  readonly recordedDurationSeconds: number;
  readonly volumeKg: number;
}

function trainingSummary(
  run: ActiveTrainingRun,
  durationSeconds: number,
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
    distanceMeters: sets.reduce(
      (total, set) => total + (set.actualDistanceMeters ?? 0),
      0,
    ),
    durationSeconds,
    plannedSets,
    recordedDurationSeconds: sets.reduce(
      (total, set) => total + (set.actualDurationSeconds ?? 0),
      0,
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

function ExerciseExecution({
  busy,
  exercise,
  onCompleteSet,
  onReviseSet,
  onStart,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onCompleteSet: (input: Omit<SetCompletionInput, "itemId" | "runId">) => void;
  onReviseSet: (request: SetRevisionRequest) => Promise<boolean>;
  onStart: () => void;
}>) {
  const revisionTriggerRef = useRef<HTMLButtonElement>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const lastSet = exercise.setExecutions.at(-1);
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

  function adjustWeight(direction: -1 | 1) {
    const currentWeight =
      parsedDecimal(weight) ?? suggestedWeight ?? weightStep;
    const adjusted = roundedWeight(currentWeight + direction * weightStep);
    setWeight(String(Math.min(2_000, Math.max(0.25, adjusted))));
  }

  function closeRevisionFlow() {
    setRevisionOpen(false);
    window.requestAnimationFrame(() => revisionTriggerRef.current?.focus());
  }

  if (exercise.completedAt) {
    return (
      <>
        <div className="exercise-completed-summary">
          <strong>Concluído</strong>
          {exercise.setExecutions.length === 0 ? (
            <p>{exerciseTarget(exercise)}</p>
          ) : null}
        </div>
        {exercise.setExecutions.length > 0 ? (
          <button
            className="button-secondary set-adjustment-trigger"
            onClick={() => setRevisionOpen(true)}
            ref={revisionTriggerRef}
            type="button"
          >
            Ajustar ou desfazer
          </button>
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
      <button
        aria-label={`Iniciar ${exercise.exerciseName}`}
        aria-busy={busy}
        className="exercise-play"
        disabled={busy}
        onClick={onStart}
        type="button"
      >
        <AppIcon name="play" size={30} />
      </button>
    );
  }

  return (
    <div className="set-execution">
      <div className="set-heading">
        <span>Agora</span>
        <strong>
          Série {nextSet} de {exercise.sets}
        </strong>
      </div>

      {previousResult ? (
        <div className="previous-set-reference">
          <span>Última vez · {previousResult.completedAt}</span>
          <strong>{previousResult.result}</strong>
        </div>
      ) : null}

      {!hasKnownMeasure && !missingMeasure ? (
        <fieldset className="measure-choice">
          <legend>Como medir?</legend>
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

      {hasKnownMeasure || missingMeasure ? (
        <button
          className="button-primary complete-set-button"
          disabled={busy || !canComplete}
          onClick={() =>
            onCompleteSet({
              actualDistanceMeters,
              actualDurationSeconds,
              actualReps,
              actualWeightKg,
              setNumber: nextSet,
            })
          }
          type="button"
        >
          {busy ? "Salvando…" : "Concluir série"}
        </button>
      ) : null}

      {exercise.setExecutions.length > 0 ? (
        <button
          className="button-secondary set-adjustment-trigger"
          onClick={() => setRevisionOpen(true)}
          ref={revisionTriggerRef}
          type="button"
        >
          Ajustar ou desfazer
        </button>
      ) : null}
      {revisionOpen ? (
        <SetRevisionFlow
          busy={busy}
          exercise={exercise}
          onClose={closeRevisionFlow}
          onRevise={onReviseSet}
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

function ElapsedTimer({
  pausedAt,
  pausedDurationSeconds,
  startedAt,
}: Readonly<{
  pausedAt: string | null;
  pausedDurationSeconds: number;
  startedAt: string;
}>) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    function updateElapsed() {
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor(
            ((pausedAt ? new Date(pausedAt).getTime() : Date.now()) -
              new Date(startedAt).getTime()) /
              1_000,
          ) - pausedDurationSeconds,
        ),
      );
    }
    updateElapsed();
    if (pausedAt) {
      return;
    }
    const timer = window.setInterval(updateElapsed, 1_000);
    const unsubscribe = subscribeToForegroundClock(updateElapsed);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [pausedAt, pausedDurationSeconds, startedAt]);

  const formatted = formatClock(elapsedSeconds);
  return <time aria-label={`Tempo de treino ${formatted}`}>{formatted}</time>;
}

const restVibrationPreferenceKey = "daygym:rest-vibration";

function RestTimer({
  canAddTime,
  endsAt,
  expanded,
  onAddTime,
  onComplete,
  onMinimize,
  onOpen,
}: Readonly<{
  canAddTime: boolean;
  endsAt: string;
  expanded: boolean;
  onAddTime: () => void;
  onComplete: () => void;
  onMinimize: () => void;
  onOpen: () => void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const miniTimerRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    function handleDialogKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && expanded) {
        onMinimize();
        return;
      }
      if (event.key !== "Tab" || !expanded) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)",
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
    window.addEventListener("keydown", handleDialogKeyboard);
    if (expanded) {
      minimizeRef.current?.focus();
    } else {
      miniTimerRef.current?.focus();
    }
    return () => window.removeEventListener("keydown", handleDialogKeyboard);
  }, [expanded, onMinimize]);

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
  if (!expanded) {
    return (
      <button
        aria-label={`Abrir descanso, ${formatted} restantes`}
        className="rest-mini-timer"
        onClick={onOpen}
        ref={miniTimerRef}
        type="button"
      >
        <span>Descanso</span>
        <time dateTime={`PT${remainingSeconds}S`}>{formatted}</time>
      </button>
    );
  }

  return (
    <div
      className="rest-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onMinimize();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="rest-title"
        aria-modal="true"
        className="rest-sheet"
        ref={dialogRef}
        role="dialog"
      >
        <div className="rest-sheet-handle" aria-hidden="true" />
        <header className="rest-sheet-header">
          <p className="eyebrow" id="rest-title">
            Descanso
          </p>
          <button
            className="button-text"
            onClick={onMinimize}
            ref={minimizeRef}
            type="button"
          >
            Voltar ao treino
          </button>
        </header>
        <time aria-live="polite" dateTime={`PT${remainingSeconds}S`}>
          {formatted}
        </time>
        <div className="rest-sheet-actions">
          <button className="button-primary" onClick={onComplete} type="button">
            Concluir descanso
          </button>
          <button
            aria-label="+30 segundos"
            className="button-secondary"
            disabled={!canAddTime}
            onClick={onAddTime}
            type="button"
          >
            +30 s
          </button>
        </div>
        {vibrationSupported ? (
          <button
            aria-pressed={vibrationEnabled}
            className="rest-vibration-toggle"
            data-enabled={vibrationEnabled ? "true" : undefined}
            onClick={toggleVibration}
            type="button"
          >
            <span>Vibrar ao terminar</span>
            <strong>{vibrationEnabled ? "Ativado" : "Desativado"}</strong>
          </button>
        ) : null}
      </section>
    </div>
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
  const [busy, setBusy] = useState(false);
  const [dialogAction, setDialogAction] = useState<
    "cancel" | "pause" | "restart"
  >();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [restExpanded, setRestExpanded] = useState(true);
  const [error, setError] = useState<string>();
  const [finishedSummary, setFinishedSummary] =
    useState<FinishedTrainingSummary>();

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

  async function startTraining() {
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
    setSelectedIndex(0);
  }

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
      return;
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
        return;
      }
      setError(sessionError(result.reason));
      return;
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
    if (nextState.activeRest) {
      setRestExpanded(true);
      return;
    }
    if (result.value.exerciseCompleted) {
      if (firstPending !== undefined && firstPending >= 0) {
        setSelectedIndex(firstPending);
      }
    }
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
    setRestExpanded(false);
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

  async function finishTraining() {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().finish(run.runId);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    setFinishedSummary(trainingSummary(run, result.value.durationSeconds));
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
        <h1>Treino concluído.</h1>
        <dl className="training-summary">
          <div className="training-summary-highlight">
            <dt>Duração</dt>
            <dd>{formatTrainingDuration(finishedSummary.durationSeconds)}</dd>
          </div>
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
    return (
      <main className="session-shell session-overview">
        <header className="session-topbar">
          <Link
            aria-label="Voltar"
            className="session-back-action"
            href="/treinos/"
          >
            <AppIcon name="back" size={30} />
          </Link>
          <span>Versão {state.plan.version}</span>
        </header>
        <section className="session-intro">
          <p className="eyebrow">{state.plan.name}</p>
          <h1>{state.nextSession.name}</h1>
          <p>
            {trainingWeekdayName(state.nextSession.weekday)} ·{" "}
            {state.nextSession.items.length} exercícios
          </p>
        </section>
        <button
          className="button-primary session-primary-action"
          disabled={busy}
          onClick={startTraining}
          type="button"
        >
          {busy ? "Iniciando…" : "Iniciar treino"}
        </button>
        <ol className="session-exercise-preview">
          {state.nextSession.items.map((exercise) => (
            <li key={exercise.itemId}>
              <span>{exercise.order}</span>
              <div>
                <strong>{exercise.exerciseName}</strong>
                <small>{exerciseTarget(exercise)}</small>
              </div>
            </li>
          ))}
        </ol>
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
  const currentExercise =
    run.session.items[selectedIndex] ?? run.session.items[0];

  return (
    <main className="session-shell session-active">
      <header className="session-topbar">
        {run.pausedAt ? (
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
        <ElapsedTimer
          pausedAt={run.pausedAt}
          pausedDurationSeconds={run.pausedDurationSeconds}
          startedAt={run.startedAt}
        />
        {syncState.status === "conflict" ? (
          <button
            aria-label="Resolver sincronização bloqueada"
            className="session-saved"
            data-sync-status={syncState.status}
            onClick={() => setConflictDialogOpen(true)}
            type="button"
          >
            {syncStatusLabel(syncState, busy, Boolean(run.pausedAt))}
          </button>
        ) : syncState.pendingCount > 0 ? (
          <button
            aria-label={`Sincronizar ${syncState.pendingCount} ${
              syncState.pendingCount === 1
                ? "registro pendente"
                : "registros pendentes"
            }`}
            className="session-saved"
            data-sync-status={syncState.status}
            disabled={syncState.status === "syncing"}
            onClick={() => void synchronizeNow()}
            type="button"
          >
            {syncStatusLabel(syncState, busy, Boolean(run.pausedAt))}
          </button>
        ) : (
          <span className="session-saved" data-sync-status={syncState.status}>
            {syncStatusLabel(syncState, busy, Boolean(run.pausedAt))}
          </span>
        )}
      </header>

      <section
        className="session-progress"
        aria-labelledby="session-progress-title"
      >
        <div>
          <p className="eyebrow">{run.session.name}</p>
          <strong id="session-progress-title">
            {completedCount} de {run.session.items.length}
          </strong>
        </div>
        <progress max={run.session.items.length} value={completedCount}>
          {completedCount} de {run.session.items.length}
        </progress>
      </section>

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

      {!run.pausedAt && allCompleted ? (
        <section className="finish-training">
          <h2>Treino completo.</h2>
          <button
            className="button-primary"
            disabled={busy}
            onClick={finishTraining}
            type="button"
          >
            {busy ? "Finalizando…" : "Finalizar treino"}
          </button>
        </section>
      ) : null}

      {!run.pausedAt ? (
        <nav className="exercise-stepper" aria-label="Exercícios do treino">
          {run.session.items.map((exercise, index) => (
            <button
              aria-current={index === selectedIndex ? "step" : undefined}
              data-completed={exercise.completedAt ? "true" : undefined}
              data-selected={index === selectedIndex ? "true" : undefined}
              key={exercise.itemId}
              onClick={() => setSelectedIndex(index)}
              type="button"
            >
              <span>{index + 1}</span>
              <small>
                {exercise.completedAt ? "Concluído" : exercise.exerciseName}
              </small>
            </button>
          ))}
        </nav>
      ) : null}

      {!run.pausedAt && currentExercise ? (
        <section className="current-exercise">
          <div className="current-exercise-heading">
            <div>
              <p className="eyebrow">
                Exercício {selectedIndex + 1} de {run.session.items.length}
              </p>
              <h1>{currentExercise.exerciseName}</h1>
            </div>
            <span>
              {currentExercise.setExecutions.length}/{currentExercise.sets}
            </span>
          </div>
          <ExerciseExecution
            busy={busy}
            exercise={currentExercise}
            key={`${currentExercise.itemId}:${currentExercise.setExecutions.length}:${currentExercise.startedAt ?? "pending"}`}
            onCompleteSet={(input) => void completeCurrentSet(input)}
            onReviseSet={reviseCurrentSet}
            onStart={() => void startCurrentExercise()}
          />
          {currentExercise.notes ? (
            <p className="exercise-notes">{currentExercise.notes}</p>
          ) : null}
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
      {conflictDialogOpen ? (
        <SyncConflictDialog
          onClose={() => setConflictDialogOpen(false)}
          onRetry={() => void resolveSyncConflict("retry")}
          onUseServer={() => void resolveSyncConflict("use-server")}
          pendingAction={conflictAction}
        />
      ) : null}
      {state?.activeRest ? (
        <RestTimer
          canAddTime={state.activeRest.durationSeconds < 1_800}
          endsAt={state.activeRest.endsAt}
          expanded={restExpanded}
          onAddTime={() => void addRestTime()}
          onComplete={() => void completeRest()}
          onMinimize={() => setRestExpanded(false)}
          onOpen={() => setRestExpanded(true)}
        />
      ) : null}
    </main>
  );
}
