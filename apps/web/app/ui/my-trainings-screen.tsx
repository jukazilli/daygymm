"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  PracticalTrainingState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { createLocalFirstTrainingSessionGateway } from "../../lib/local-first-training-session-gateway";
import {
  currentTrainingWeekday,
  trainingSessionHref,
  trainingWeekdayName,
} from "../../lib/training-weekdays";
import { AppIcon } from "./app-icon";
import { AppLoadingSkeleton, AppShell, FocusedBackAction } from "./app-shell";

interface MyTrainingsScreenProps {
  readonly gateway?: TrainingSessionGateway;
  readonly navigate?: (path: string) => void;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

export function MyTrainingsScreen({
  gateway: providedGateway,
  navigate = defaultNavigate,
}: MyTrainingsScreenProps) {
  const gatewayRef = useRef<TrainingSessionGateway | undefined>(
    providedGateway,
  );
  const [state, setState] = useState<PracticalTrainingState>();
  const [failed, setFailed] = useState(false);
  const today = currentTrainingWeekday();

  function gateway() {
    gatewayRef.current ??= createLocalFirstTrainingSessionGateway();
    return gatewayRef.current;
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
          setFailed(true);
          return;
        }
        setState(result.value);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AppShell active="workouts" variant="focused">
      <FocusedBackAction href="/treinos/" />
      {!state && !failed ? (
        <AppLoadingSkeleton label="Carregando seus treinos" />
      ) : null}
      {state?.plan ? (
        <div className="my-trainings-page">
          <header className="plan-editor-header">
            <div>
              <p className="eyebrow">{state.plan.name}</p>
              <h1>Meus treinos</h1>
            </div>
          </header>
          <ol className="weekly-training-list" aria-label="Agenda semanal">
            {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
              const sessions = state.sessions.filter(
                (session) => session.weekday === weekday,
              );
              return (
                <li
                  className="weekly-training-day"
                  data-today={weekday === today ? "true" : undefined}
                  key={weekday}
                >
                  <div className="weekly-training-day-heading">
                    <strong>{trainingWeekdayName(weekday)}</strong>
                    {weekday === today ? <small>Hoje</small> : null}
                  </div>
                  {sessions.length > 0 ? (
                    <div className="weekly-training-sessions">
                      {sessions.map((session) => (
                        <Link
                          className="weekly-training-session"
                          href={trainingSessionHref(session.sessionId)}
                          key={session.sessionId}
                        >
                          <span>
                            <strong>{session.name}</strong>
                            <small>{session.items.length} exercícios</small>
                          </span>
                          <AppIcon name="forward" size={20} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <small className="weekly-training-rest">Descanso</small>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {state && !state.plan ? (
        <section className="app-state-card">
          <p className="eyebrow">Meus treinos</p>
          <h1>Crie ou importe um plano primeiro.</h1>
          <Link className="button-primary" href="/treinos/">
            Ir para Treinos
          </Link>
        </section>
      ) : null}
      {failed ? (
        <section className="app-state-card" role="alert">
          <p className="eyebrow">Meus treinos</p>
          <h1>Não foi possível carregar.</h1>
          <button
            className="button-secondary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Tentar novamente
          </button>
        </section>
      ) : null}
    </AppShell>
  );
}
