"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PracticalTrainingExercise,
  PracticalTrainingState,
  SetCompletionInput,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { createWebTrainingSessionGateway } from "../../lib/training-session-gateway";
import { trainingWeekdayName } from "../../lib/training-weekdays";
import { AppLoadingSkeleton } from "./app-shell";

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

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
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
    exercise.durationSeconds ? formatDuration(exercise.durationSeconds) : null,
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
    performed.actualWeightKg !== null ? `${performed.actualWeightKg} kg` : null,
    performed.actualReps !== null ? `${performed.actualReps} repetições` : null,
    performed.actualDurationSeconds !== null
      ? formatDuration(performed.actualDurationSeconds)
      : null,
    performed.actualDistanceMeters !== null
      ? `${performed.actualDistanceMeters} m`
      : null,
  ]
    .filter(Boolean)
    .join(" × ");
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

function ExerciseExecution({
  busy,
  exercise,
  onCompleteSet,
  onStart,
}: Readonly<{
  busy: boolean;
  exercise: PracticalTrainingExercise;
  onCompleteSet: (input: Omit<SetCompletionInput, "itemId" | "runId">) => void;
  onStart: () => void;
}>) {
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
  const [reps, setReps] = useState(
    hasPlannedReps
      ? String(exercise.repsMax)
      : lastSet?.actualReps !== null && lastSet?.actualReps !== undefined
        ? String(lastSet.actualReps)
        : "",
  );
  const [weight, setWeight] = useState(
    exercise.plannedWeightKg !== null
      ? String(exercise.plannedWeightKg)
      : lastSet?.actualWeightKg !== null &&
          lastSet?.actualWeightKg !== undefined
        ? String(lastSet.actualWeightKg)
        : "",
  );
  const [duration, setDuration] = useState(
    exercise.durationSeconds !== null
      ? String(exercise.durationSeconds)
      : lastSet?.actualDurationSeconds !== null &&
          lastSet?.actualDurationSeconds !== undefined
        ? String(lastSet.actualDurationSeconds)
        : "",
  );
  const [distance, setDistance] = useState(
    exercise.distanceMeters !== null ? String(exercise.distanceMeters) : "",
  );
  const nextSet = exercise.setExecutions.length + 1;
  const actualReps = needsReps ? parsedInteger(reps) : null;
  const actualWeightKg = weight ? parsedDecimal(weight) : null;
  const actualDurationSeconds = needsDuration ? parsedInteger(duration) : null;
  const actualDistanceMeters = needsDistance ? parsedInteger(distance) : null;
  const canComplete =
    nextSet <= exercise.sets &&
    (!needsReps || actualReps !== null) &&
    (!needsDuration || actualDurationSeconds !== null) &&
    (!needsDistance || actualDistanceMeters !== null);

  if (exercise.completedAt) {
    return (
      <div className="exercise-completed-summary">
        <strong>Concluído</strong>
        {exercise.setExecutions.length > 0 ? (
          <ol>
            {exercise.setExecutions.map((set, index) => (
              <li key={set.setExecutionId}>
                <span>Série {set.setNumber}</span>
                <strong>{setResult(exercise, index)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p>{exerciseTarget(exercise)}</p>
        )}
      </div>
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
        <span aria-hidden="true">▶</span>
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
            <label>
              <span>
                Carga <small>kg</small>
              </span>
              <input
                inputMode="decimal"
                min="0.25"
                onChange={(event) => setWeight(event.target.value)}
                placeholder="—"
                step="0.25"
                type="number"
                value={weight}
              />
            </label>
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
              <span>
                Tempo <small>segundos</small>
              </span>
              <input
                inputMode="numeric"
                max="7200"
                min="1"
                onChange={(event) => setDuration(event.target.value)}
                type="number"
                value={duration}
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
        <section
          className="completed-sets"
          aria-labelledby="completed-sets-title"
        >
          <h2 id="completed-sets-title">Realizado</h2>
          <ol>
            {exercise.setExecutions.map((set, index) => (
              <li key={set.setExecutionId}>
                <span>✓ Série {set.setNumber}</span>
                <strong>{setResult(exercise, index)}</strong>
              </li>
            ))}
          </ol>
        </section>
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
    return () => window.clearInterval(timer);
  }, [pausedAt, pausedDurationSeconds, startedAt]);

  const formatted = formatClock(elapsedSeconds);
  return <time aria-label={`Tempo de treino ${formatted}`}>{formatted}</time>;
}

function PauseTrainingDialog({
  busy,
  onClose,
  onConfirm,
}: Readonly<{
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  const confirmRef = useRef<HTMLButtonElement>(null);

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
        <h2 id="pause-training-title">Pausar treino?</h2>
        <p>Seu progresso está salvo. Você pode continuar depois.</p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {busy ? "Pausando…" : "Pausar treino"}
          </button>
          <button
            className="button-secondary"
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [finishedDuration, setFinishedDuration] = useState<number>();

  function gateway() {
    gatewayRef.current ??= createWebTrainingSessionGateway();
    return gatewayRef.current;
  }

  async function refresh() {
    const result = await gateway().load();
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
    const result = await gateway().completeSet({
      ...input,
      itemId: currentExercise.itemId,
      runId: run.runId,
    });
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(sessionError(result.reason));
      return;
    }
    const refreshed = await refresh();
    setBusy(false);
    if (result.value.exerciseCompleted) {
      const firstPending = refreshed?.activeRun?.session.items.findIndex(
        (item) => !item.completedAt,
      );
      if (firstPending !== undefined && firstPending >= 0) {
        setSelectedIndex(firstPending);
      }
    }
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
    setFinishedDuration(result.value.durationSeconds);
  }

  async function pauseTraining() {
    const run = state?.activeRun;
    if (!run || run.pausedAt || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().pause(run.runId);
    setBusy(false);
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

  if (finishedDuration !== undefined) {
    return (
      <main className="session-shell session-finished">
        <p className="eyebrow">Treino salvo</p>
        <h1>Treino concluído.</h1>
        <p>{formatDuration(finishedDuration)} de atividade</p>
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
          <Link href="/treinos/">Voltar</Link>
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
          <Link href="/treinos/">Voltar</Link>
        ) : (
          <button
            className="session-pause-action"
            disabled={busy}
            onClick={() => setPauseDialogOpen(true)}
            type="button"
          >
            Pausar
          </button>
        )}
        <ElapsedTimer
          pausedAt={run.pausedAt}
          pausedDurationSeconds={run.pausedDurationSeconds}
          startedAt={run.startedAt}
        />
        <span className="session-saved">
          {run.pausedAt ? "Pausado" : busy ? "Salvando…" : "Salvo"}
        </span>
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
            onStart={() => void startCurrentExercise()}
          />
          <div className="exercise-target">
            <span>Planejado</span>
            <strong>{exerciseTarget(currentExercise)}</strong>
          </div>
          {currentExercise.restSeconds > 0 ? (
            <p className="exercise-rest">
              Descanso previsto: {formatDuration(currentExercise.restSeconds)}
            </p>
          ) : null}
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
          busy={busy}
          onClose={() => setPauseDialogOpen(false)}
          onConfirm={() => void pauseTraining()}
        />
      ) : null}
    </main>
  );
}
