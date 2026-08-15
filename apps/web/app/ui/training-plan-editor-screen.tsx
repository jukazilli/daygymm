"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  publishTrainingPlanInputSchema,
  type TrainingLoadMode,
  type TrainingModality,
  type TrainingPlanDraft,
  type TrainingPlanDraftItem,
  type TrainingPlanEditorGateway,
} from "@daygym/contracts";

import { createWebTrainingPlanEditorGateway } from "../../lib/training-plan-editor-gateway";
import { trainingWeekdayName } from "../../lib/training-weekdays";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface TrainingPlanEditorScreenProps {
  readonly gateway?: TrainingPlanEditorGateway;
  readonly mode?: "full" | "loads";
  readonly navigate?: (path: string) => void;
}

const modalityLabels: Record<TrainingModality, string> = {
  cardio: "Cardio",
  circuit: "Circuito",
  distance: "Distância",
  strength: "Força",
  time: "Tempo",
};

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function randomUuid() {
  return globalThis.crypto.randomUUID();
}

function blankItem(order: number): TrainingPlanDraftItem {
  return {
    circuitGroup: null,
    distanceMeters: null,
    durationSeconds: null,
    exerciseName: "",
    itemId: randomUuid(),
    loadIncrementKg: null,
    loadMode: "unconfigured",
    modality: "strength",
    notes: null,
    order,
    plannedWeightKg: null,
    repsMax: 12,
    repsMin: 8,
    restSeconds: 60,
    sets: 3,
  };
}

function blankDraft(): TrainingPlanDraft {
  return {
    currentVersion: null,
    name: "Meu plano",
    planId: null,
    sessions: [
      {
        dayOrder: 1,
        items: [blankItem(1)],
        name: "Treino A",
        sessionId: randomUuid(),
      },
    ],
  };
}

function numberValue(value: string) {
  return value === "" ? null : Number(value);
}

function trainingSlotLabel(dayOrder: number) {
  const weekday = ((dayOrder - 1) % 7) + 1;
  const slot = dayOrder > 7 ? "2º horário" : "1º horário";
  return `${trainingWeekdayName(weekday)} · ${slot}`;
}

function modalityItem(
  item: TrainingPlanDraftItem,
  modality: TrainingModality,
): TrainingPlanDraftItem {
  const loadMode: TrainingLoadMode =
    modality === "strength" ? "unconfigured" : "none";
  const common = {
    ...item,
    circuitGroup: null,
    distanceMeters: null,
    durationSeconds: null,
    loadIncrementKg: null,
    loadMode,
    modality,
    plannedWeightKg: null,
    repsMax: null,
    repsMin: null,
  };
  if (modality === "strength") {
    return { ...common, repsMax: 12, repsMin: 8 };
  }
  if (modality === "time") {
    return { ...common, durationSeconds: 30 };
  }
  if (modality === "distance" || modality === "cardio") {
    return { ...common, durationSeconds: 1_200 };
  }
  return { ...common, circuitGroup: "Circuito 1" };
}

function LoadConfiguration({
  item,
  onChange,
}: Readonly<{
  item: TrainingPlanDraftItem;
  onChange: (item: TrainingPlanDraftItem) => void;
}>) {
  function changeMode(loadMode: TrainingLoadMode) {
    onChange({
      ...item,
      loadIncrementKg: loadMode === "external" ? item.loadIncrementKg : null,
      loadMode,
      plannedWeightKg: loadMode === "none" ? null : item.plannedWeightKg,
    });
  }

  return (
    <fieldset className="load-configuration">
      <legend>Carga</legend>
      <label>
        <span>Como você treina?</span>
        <select
          onChange={(event) =>
            changeMode(event.target.value as TrainingLoadMode)
          }
          value={item.loadMode}
        >
          <option value="unconfigured">Configurar depois</option>
          <option value="external">Usa carga externa</option>
          <option value="none">Sem carga externa</option>
        </select>
      </label>
      {item.loadMode === "external" ? (
        <>
          <div className="plan-field-grid plan-field-grid-two">
            <label>
              <span>Carga inicial (kg)</span>
              <input
                inputMode="decimal"
                max="2000"
                min="0.25"
                onChange={(event) =>
                  onChange({
                    ...item,
                    plannedWeightKg: numberValue(event.target.value),
                  })
                }
                required
                step="0.25"
                type="number"
                value={item.plannedWeightKg ?? ""}
              />
            </label>
            <label>
              <span>Passo do equipamento (kg)</span>
              <input
                inputMode="decimal"
                max="2000"
                min="0.01"
                onChange={(event) =>
                  onChange({
                    ...item,
                    loadIncrementKg: numberValue(event.target.value),
                  })
                }
                required
                step="0.01"
                type="number"
                value={item.loadIncrementKg ?? ""}
              />
            </label>
          </div>
          <small className="load-configuration-help">
            O passo orienta a próxima sessão. A carga não aumenta
            automaticamente entre as séries.
          </small>
        </>
      ) : null}
    </fieldset>
  );
}

function ExerciseEditor({
  canRemove,
  item,
  onChange,
  onRemove,
}: Readonly<{
  canRemove: boolean;
  item: TrainingPlanDraftItem;
  onChange: (item: TrainingPlanDraftItem) => void;
  onRemove: () => void;
}>) {
  return (
    <article className="plan-exercise-editor">
      <div className="plan-editor-card-heading">
        <strong>Exercício {item.order}</strong>
        <button
          className="button-text button-danger-text"
          disabled={!canRemove}
          onClick={onRemove}
          type="button"
        >
          Remover
        </button>
      </div>
      <div className="plan-field-grid plan-field-grid-two">
        <label>
          <span>Exercício</span>
          <input
            maxLength={120}
            onChange={(event) =>
              onChange({ ...item, exerciseName: event.target.value })
            }
            required
            value={item.exerciseName}
          />
        </label>
        <label>
          <span>Tipo</span>
          <select
            onChange={(event) =>
              onChange(
                modalityItem(item, event.target.value as TrainingModality),
              )
            }
            value={item.modality}
          >
            {Object.entries(modalityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Séries</span>
          <input
            max="20"
            min="1"
            onChange={(event) =>
              onChange({ ...item, sets: Number(event.target.value) })
            }
            required
            type="number"
            value={item.sets}
          />
        </label>
        <label>
          <span>Descanso (segundos)</span>
          <input
            max="1800"
            min="0"
            onChange={(event) =>
              onChange({ ...item, restSeconds: Number(event.target.value) })
            }
            required
            type="number"
            value={item.restSeconds}
          />
        </label>
        {item.modality === "strength" ? (
          <>
            <label>
              <span>Repetições mínimas</span>
              <input
                max="1000"
                min="1"
                onChange={(event) =>
                  onChange({
                    ...item,
                    repsMin: numberValue(event.target.value),
                  })
                }
                required
                type="number"
                value={item.repsMin ?? ""}
              />
            </label>
            <label>
              <span>Repetições máximas</span>
              <input
                max="1000"
                min="1"
                onChange={(event) =>
                  onChange({
                    ...item,
                    repsMax: numberValue(event.target.value),
                  })
                }
                required
                type="number"
                value={item.repsMax ?? ""}
              />
            </label>
          </>
        ) : null}
        {item.modality === "time" ||
        item.modality === "distance" ||
        item.modality === "cardio" ? (
          <label>
            <span>Duração (segundos)</span>
            <input
              max="7200"
              min="1"
              onChange={(event) =>
                onChange({
                  ...item,
                  durationSeconds: numberValue(event.target.value),
                })
              }
              required={item.modality === "time"}
              type="number"
              value={item.durationSeconds ?? ""}
            />
          </label>
        ) : null}
        {item.modality === "distance" || item.modality === "cardio" ? (
          <label>
            <span>Distância (metros)</span>
            <input
              max="100000"
              min="1"
              onChange={(event) =>
                onChange({
                  ...item,
                  distanceMeters: numberValue(event.target.value),
                })
              }
              type="number"
              value={item.distanceMeters ?? ""}
            />
          </label>
        ) : null}
        {item.modality === "circuit" ? (
          <label>
            <span>Nome do circuito</span>
            <input
              maxLength={40}
              onChange={(event) =>
                onChange({ ...item, circuitGroup: event.target.value })
              }
              required
              value={item.circuitGroup ?? ""}
            />
          </label>
        ) : null}
      </div>
      {item.modality === "strength" ? (
        <LoadConfiguration item={item} onChange={onChange} />
      ) : null}
      <label>
        <span>Observação</span>
        <textarea
          maxLength={500}
          onChange={(event) =>
            onChange({ ...item, notes: event.target.value || null })
          }
          rows={2}
          value={item.notes ?? ""}
        />
      </label>
    </article>
  );
}

function ArchiveDialog({
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
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="archive-plan-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <h2 id="archive-plan-title">Arquivar este plano?</h2>
        <p>Ele sai da agenda, mas seus treinos concluídos continuam salvos.</p>
        <div className="session-dialog-actions">
          <button
            className="button-danger"
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {busy ? "Arquivando…" : "Arquivar plano"}
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Manter plano
          </button>
        </div>
      </section>
    </div>
  );
}

export function TrainingPlanEditorScreen({
  gateway: providedGateway,
  mode = "full",
  navigate = defaultNavigate,
}: TrainingPlanEditorScreenProps) {
  const gatewayRef = useRef<TrainingPlanEditorGateway | undefined>(
    providedGateway,
  );
  const [draft, setDraft] = useState<TrainingPlanDraft>();
  const [noPlan, setNoPlan] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string>();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedPlanId, setArchivedPlanId] = useState<string>();

  function gateway() {
    gatewayRef.current ??= createWebTrainingPlanEditorGateway();
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
        if (!result.value && mode === "loads") {
          setNoPlan(true);
        } else {
          setDraft(result.value ?? blankDraft());
        }
        setChangeSummary(
          mode === "loads"
            ? "Configurei as cargas"
            : result.value
              ? "Atualizei o plano"
              : "Criei o plano",
        );
        setOperationId(`plan-publish:${randomUuid()}`);
      });
    return () => {
      active = false;
    };
  }, [mode, navigate]);

  function updateSession(
    sessionId: string,
    update: (
      session: TrainingPlanDraft["sessions"][number],
    ) => TrainingPlanDraft["sessions"][number],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            sessions: current.sessions.map((session) =>
              session.sessionId === sessionId ? update(session) : session,
            ),
          }
        : current,
    );
  }

  function updateItem(
    sessionId: string,
    itemId: string,
    item: TrainingPlanDraftItem,
  ) {
    updateSession(sessionId, (session) => ({
      ...session,
      items: session.items.map((current) =>
        current.itemId === itemId ? item : current,
      ),
    }));
  }

  async function publish() {
    if (!draft || busy) {
      return;
    }
    const input = {
      changeSummary,
      name: draft.name,
      operationId,
      planId: draft.planId,
      sessions: draft.sessions.map((session) => ({
        ...session,
        dayOrder: session.dayOrder,
        items: session.items.map((item, itemIndex) => ({
          ...item,
          order: itemIndex + 1,
        })),
        name: session.name,
        sessionId: session.sessionId,
      })),
    };
    if (!publishTrainingPlanInputSchema.safeParse(input).success) {
      setError("Revise os campos obrigatórios antes de salvar.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().publish(input);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError(
        result.reason === "invalid"
          ? "Revise os campos ou finalize o treino em andamento."
          : "Não foi possível salvar o plano.",
      );
      return;
    }
    navigate("/treinos/");
  }

  async function archive() {
    if (!draft?.planId || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await gateway().archive(draft.planId);
    setBusy(false);
    setArchiveOpen(false);
    if (!result.ok) {
      if (result.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setError("Finalize ou cancele o treino em andamento antes de arquivar.");
      return;
    }
    setArchivedPlanId(result.value.planId);
  }

  async function restore() {
    if (!archivedPlanId || busy) {
      return;
    }
    setBusy(true);
    const result = await gateway().restore(archivedPlanId);
    setBusy(false);
    if (!result.ok) {
      setError("Não foi possível restaurar o plano.");
      return;
    }
    setArchivedPlanId(undefined);
  }

  if (failed) {
    return (
      <AppShell active="workouts">
        <section className="app-state-card" role="alert">
          <h1>Não foi possível carregar o plano.</h1>
          <Link className="button-secondary" href="/treinos/">
            Voltar para Treinos
          </Link>
        </section>
      </AppShell>
    );
  }

  if (noPlan) {
    return (
      <AppShell active="workouts">
        <section className="app-state-card plan-archived-state">
          <p className="eyebrow">Cargas do plano</p>
          <h1>Crie ou importe um plano primeiro.</h1>
          <Link className="button-primary" href="/treinos/">
            Ir para Treinos
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!draft) {
    return (
      <AppShell active="workouts">
        <AppLoadingSkeleton label="Carregando plano" />
      </AppShell>
    );
  }

  if (archivedPlanId) {
    return (
      <AppShell active="workouts">
        <section className="app-state-card plan-archived-state">
          <p className="eyebrow">Plano arquivado</p>
          <h1>O histórico foi preservado.</h1>
          <button
            className="button-primary"
            disabled={busy}
            onClick={() => void restore()}
            type="button"
          >
            {busy ? "Restaurando…" : "Desfazer"}
          </button>
          <Link className="button-text" href="/treinos/">
            Voltar para Treinos
          </Link>
        </section>
      </AppShell>
    );
  }

  const strengthItems = draft.sessions.flatMap((session) =>
    session.items
      .filter((item) => item.modality === "strength")
      .map((item) => ({ item, session })),
  );

  return (
    <AppShell active="workouts">
      <div className="plan-editor-page">
        <header className="plan-editor-header">
          <Link className="button-text" href="/treinos/">
            Voltar
          </Link>
          <div>
            <p className="eyebrow">
              {mode === "loads"
                ? "Cargas do plano"
                : draft.planId
                  ? `Versão ${draft.currentVersion}`
                  : "Novo plano"}
            </p>
            <h1>{mode === "loads" ? "Configurar cargas" : "Montar plano"}</h1>
          </div>
        </header>

        <form
          className="plan-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            void publish();
          }}
        >
          {mode === "full" ? (
            <section className="plan-editor-section">
              <label>
                <span>Nome do plano</span>
                <input
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  required
                  value={draft.name}
                />
              </label>
              {draft.planId ? (
                <label>
                  <span>Resumo da mudança</span>
                  <input
                    maxLength={240}
                    onChange={(event) => setChangeSummary(event.target.value)}
                    required
                    value={changeSummary}
                  />
                </label>
              ) : null}
            </section>
          ) : null}

          {mode === "loads" ? (
            <section className="plan-editor-section load-settings-list">
              {strengthItems.length > 0 ? (
                strengthItems.map(({ item, session }) => (
                  <article className="load-settings-card" key={item.itemId}>
                    <div>
                      <small>{trainingSlotLabel(session.dayOrder)}</small>
                      <h2>{item.exerciseName}</h2>
                    </div>
                    <LoadConfiguration
                      item={item}
                      onChange={(changed) =>
                        updateItem(session.sessionId, item.itemId, changed)
                      }
                    />
                  </article>
                ))
              ) : (
                <div className="plan-editor-empty">
                  <h2>Este plano não tem exercícios de força.</h2>
                  <Link className="button-secondary" href="/treinos/">
                    Voltar para Treinos
                  </Link>
                </div>
              )}
            </section>
          ) : (
            <div className="plan-session-list">
              {draft.sessions.map((session, sessionIndex) => (
                <section
                  className="plan-session-editor"
                  key={session.sessionId}
                >
                  <div className="plan-editor-card-heading">
                    <h2>Treino {sessionIndex + 1}</h2>
                    <button
                      className="button-text button-danger-text"
                      disabled={draft.sessions.length === 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          sessions: draft.sessions.filter(
                            (current) =>
                              current.sessionId !== session.sessionId,
                          ),
                        })
                      }
                      type="button"
                    >
                      Remover treino
                    </button>
                  </div>
                  <div className="plan-field-grid plan-field-grid-two">
                    <label>
                      <span>Dia da semana</span>
                      <select
                        onChange={(event) =>
                          updateSession(session.sessionId, (current) => ({
                            ...current,
                            dayOrder: Number(event.target.value),
                          }))
                        }
                        value={session.dayOrder}
                      >
                        {Array.from(
                          { length: 14 },
                          (_, index) => index + 1,
                        ).map((slot) => (
                          <option key={slot} value={slot}>
                            {trainingSlotLabel(slot)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Nome do treino</span>
                      <input
                        maxLength={80}
                        onChange={(event) =>
                          updateSession(session.sessionId, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        required
                        value={session.name}
                      />
                    </label>
                  </div>
                  <div className="plan-exercise-list">
                    {session.items.map((item) => (
                      <ExerciseEditor
                        canRemove={session.items.length > 1}
                        item={item}
                        key={item.itemId}
                        onChange={(changed) =>
                          updateItem(session.sessionId, item.itemId, changed)
                        }
                        onRemove={() =>
                          updateSession(session.sessionId, (current) => ({
                            ...current,
                            items: current.items
                              .filter(
                                (candidate) => candidate.itemId !== item.itemId,
                              )
                              .map((candidate, index) => ({
                                ...candidate,
                                order: index + 1,
                              })),
                          }))
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="button-secondary"
                    onClick={() =>
                      updateSession(session.sessionId, (current) => ({
                        ...current,
                        items: [
                          ...current.items,
                          blankItem(current.items.length + 1),
                        ],
                      }))
                    }
                    type="button"
                  >
                    Adicionar exercício
                  </button>
                </section>
              ))}
              <button
                className="button-secondary add-training-day"
                disabled={draft.sessions.length === 14}
                onClick={() => {
                  const used = new Set(
                    draft.sessions.map((session) => session.dayOrder),
                  );
                  const nextDay =
                    Array.from({ length: 14 }, (_, index) => index + 1).find(
                      (slot) => !used.has(slot),
                    ) ?? 1;
                  setDraft({
                    ...draft,
                    sessions: [
                      ...draft.sessions,
                      {
                        dayOrder: nextDay,
                        items: [blankItem(1)],
                        name: `Treino ${String.fromCharCode(65 + draft.sessions.length)}`,
                        sessionId: randomUuid(),
                      },
                    ],
                  });
                }}
                type="button"
              >
                Adicionar treino
              </button>
            </div>
          )}

          {error ? (
            <p className="status-message status-error" role="alert">
              {error}
            </p>
          ) : null}

          {mode === "full" || strengthItems.length > 0 ? (
            <div className="plan-editor-actions">
              <button className="button-primary" disabled={busy} type="submit">
                {busy
                  ? "Salvando…"
                  : draft.planId
                    ? "Salvar nova versão"
                    : "Criar plano"}
              </button>
              {mode === "full" && draft.planId ? (
                <button
                  className="button-danger"
                  disabled={busy}
                  onClick={() => setArchiveOpen(true)}
                  type="button"
                >
                  Arquivar plano
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
      {archiveOpen ? (
        <ArchiveDialog
          busy={busy}
          onClose={() => setArchiveOpen(false)}
          onConfirm={() => void archive()}
        />
      ) : null}
    </AppShell>
  );
}
