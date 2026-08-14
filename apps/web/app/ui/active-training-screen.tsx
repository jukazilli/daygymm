"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PracticalTrainingExercise,
  PracticalTrainingState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { createWebTrainingSessionGateway } from "../../lib/training-session-gateway";
import { AppLoadingSkeleton } from "./app-shell";

interface ActiveTrainingScreenProps {
  readonly gateway?: TrainingSessionGateway;
  readonly navigate?: (path: string) => void;
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
  if (exercise.modality === "strength" || exercise.modality === "circuit") {
    const repetitions =
      exercise.repsMin === exercise.repsMax
        ? `${exercise.repsMin} repetições`
        : `${exercise.repsMin}–${exercise.repsMax} repetições`;
    return `${prefix} · ${repetitions}`;
  }
  const targets = [
    exercise.durationSeconds ? formatDuration(exercise.durationSeconds) : null,
    exercise.distanceMeters ? `${exercise.distanceMeters} m` : null,
  ].filter(Boolean);
  return `${prefix} · ${targets.join(" · ")}`;
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

function ElapsedTimer({ startedAt }: Readonly<{ startedAt: string }>) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    function updateElapsed() {
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(startedAt).getTime()) / 1_000),
        ),
      );
    }
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const formatted = formatClock(elapsedSeconds);
  return <time aria-label={`Tempo de treino ${formatted}`}>{formatted}</time>;
}

export function ActiveTrainingScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: ActiveTrainingScreenProps) {
  const gatewayRef = useRef<TrainingSessionGateway | undefined>(
    providedGateway,
  );
  const [state, setState] = useState<PracticalTrainingState>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);
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
    void gateway()
      .load()
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
  }, [navigate]);

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

  async function completeCurrentExercise() {
    const run = state?.activeRun;
    const currentExercise = run?.session.items[selectedIndex];
    if (!run || !currentExercise || currentExercise.completedAt || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().completeExercise(
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
    const refreshed = await refresh();
    setBusy(false);
    const firstPending = refreshed?.activeRun?.session.items.findIndex(
      (item) => !item.completedAt,
    );
    if (firstPending !== undefined && firstPending >= 0) {
      setSelectedIndex(firstPending);
    }
  }

  async function finishTraining() {
    const run = state?.activeRun;
    if (!run || busy) {
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
          <p>{state.nextSession.items.length} exercícios</p>
        </section>
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
        <button
          className="button-primary session-primary-action"
          disabled={busy}
          onClick={startTraining}
          type="button"
        >
          {busy ? "Iniciando…" : "Iniciar treino"}
        </button>
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
        <Link href="/treinos/">Sair</Link>
        <ElapsedTimer startedAt={run.startedAt} />
        <span className="session-saved">Salvo</span>
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

      {currentExercise ? (
        <section className="current-exercise">
          <p className="eyebrow">
            Exercício {selectedIndex + 1} de {run.session.items.length}
          </p>
          <h1>{currentExercise.exerciseName}</h1>
          <div className="exercise-target">
            <span>Meta</span>
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
          <button
            className="button-primary session-primary-action"
            disabled={busy || Boolean(currentExercise.completedAt)}
            onClick={completeCurrentExercise}
            type="button"
          >
            {currentExercise.completedAt
              ? "Exercício concluído"
              : busy
                ? "Salvando…"
                : "Concluir exercício"}
          </button>
        </section>
      ) : null}

      {error ? (
        <p className="status-message status-error" role="alert">
          {error}
        </p>
      ) : null}

      {allCompleted ? (
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
    </main>
  );
}
