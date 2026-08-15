"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

import {
  publishTrainingPlanInputSchema,
  type TrainingLoadMode,
  type TrainingModality,
  type TrainingPlanDraft,
  type TrainingPlanDraftItem,
  type TrainingPlanEditorGateway,
} from "@daygym/contracts";

import { createWebTrainingPlanEditorGateway } from "../../lib/training-plan-editor-gateway";
import {
  formatTrainingDuration,
  maximumExerciseDurationSeconds,
  maximumRestDurationSeconds,
} from "../../lib/training-duration";
import { trainingWeekdayName } from "../../lib/training-weekdays";
import { AppIcon } from "./app-icon";
import {
  AppLoadingSkeleton,
  AppShell,
  FixedActionBar,
  FocusedBackAction,
} from "./app-shell";
import { DurationInput } from "./duration-input";

interface TrainingPlanEditorScreenProps {
  readonly gateway?: TrainingPlanEditorGateway;
  readonly mode?: "full" | "loads";
  readonly navigate?: (path: string) => void;
}

interface LoadEditSnapshot {
  readonly item: TrainingPlanDraftItem;
  readonly sessionId: string;
}

const modalityLabels: Record<TrainingModality, string> = {
  cardio: "Cardio",
  circuit: "Circuito",
  distance: "Distância",
  strength: "Força",
  time: "Tempo",
};
const loadGuidePreferenceKey = "daygym:load-guide:v1";
const editGuidePreferenceKey = "daygym:edit-list-guide:v1";

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
    setProgressionKg: null,
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

interface EditorListOption {
  readonly id: string;
  readonly index: number;
  readonly primary: string;
  readonly secondary: string;
}

function EditorEntityList({
  actionLabel,
  ariaLabel,
  onSelect,
  options,
  variant,
}: Readonly<{
  actionLabel?: (option: EditorListOption) => string;
  ariaLabel: string;
  onSelect: (id: string) => void;
  options: readonly EditorListOption[];
  variant: "exercise" | "session";
}>) {
  return (
    <ol
      aria-label={ariaLabel}
      className={`editor-entity-list editor-${variant}-list`}
    >
      {options.map((option) => (
        <li key={option.id}>
          <button
            aria-label={actionLabel?.(option) ?? `Editar ${option.primary}`}
            className="editor-entity-row"
            onClick={() => onSelect(option.id)}
            title={actionLabel?.(option) ?? `Editar ${option.primary}`}
            type="button"
          >
            <span className="editor-entity-index">{option.index}</span>
            <span className="editor-entity-copy">
              <strong>{option.primary}</strong>
              <small>{option.secondary}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function PlanSelect({
  children,
  ...properties
}: Readonly<ComponentPropsWithoutRef<"select">>) {
  return (
    <span className="plan-select-control">
      <select {...properties}>{children}</select>
      <AppIcon name="select" size={20} />
    </span>
  );
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
    setProgressionKg: null,
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

function exerciseSummary(item: TrainingPlanDraftItem) {
  if (item.modality === "strength") {
    return `${item.sets} séries · ${item.repsMin ?? "—"}–${item.repsMax ?? "—"} repetições`;
  }
  if (item.durationSeconds !== null) {
    return `${item.sets} séries · ${formatTrainingDuration(item.durationSeconds)}`;
  }
  if (item.distanceMeters !== null) {
    return `${item.sets} séries · ${item.distanceMeters} m`;
  }
  return `${item.sets} séries · ${modalityLabels[item.modality]}`;
}

function formattedLoad(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function loadSummary(item: TrainingPlanDraftItem) {
  if (item.loadMode === "none") {
    return "Sem carga externa";
  }
  if (
    item.loadMode === "external" &&
    item.plannedWeightKg !== null &&
    item.loadIncrementKg !== null &&
    item.setProgressionKg !== null
  ) {
    return `${formattedLoad(item.plannedWeightKg)} kg · +${formattedLoad(item.setProgressionKg)} kg/série · ${formattedLoad(item.loadIncrementKg)} kg/sessão`;
  }
  return "Configurar carga";
}

function loadSequence(item: TrainingPlanDraftItem) {
  if (
    item.loadMode !== "external" ||
    item.plannedWeightKg === null ||
    item.setProgressionKg === null
  ) {
    return null;
  }
  const initialLoad = item.plannedWeightKg;
  const progression = item.setProgressionKg;
  return Array.from({ length: item.sets }, (_, index) =>
    formattedLoad(initialLoad + progression * index),
  ).join(" → ");
}

function LoadConfiguration({
  item,
  onChange,
}: Readonly<{
  item: TrainingPlanDraftItem;
  onChange: (item: TrainingPlanDraftItem) => void;
}>) {
  const sequence = loadSequence(item);

  function changeMode(loadMode: TrainingLoadMode) {
    onChange({
      ...item,
      loadIncrementKg: loadMode === "external" ? item.loadIncrementKg : null,
      loadMode,
      plannedWeightKg: loadMode === "none" ? null : item.plannedWeightKg,
      setProgressionKg:
        loadMode === "external" ? (item.setProgressionKg ?? 0) : null,
    });
  }

  return (
    <fieldset className="load-configuration">
      <legend>Carga</legend>
      <label>
        <span>Como você treina?</span>
        <PlanSelect
          onChange={(event) =>
            changeMode(event.target.value as TrainingLoadMode)
          }
          value={item.loadMode}
        >
          <option value="unconfigured">Configurar depois</option>
          <option value="external">Usa carga externa</option>
          <option value="none">Sem carga externa</option>
        </PlanSelect>
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
                step="0.01"
                type="number"
                value={item.plannedWeightKg ?? ""}
              />
            </label>
            <label>
              <span>Progressão entre séries (kg)</span>
              <input
                inputMode="decimal"
                max="2000"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...item,
                    setProgressionKg: numberValue(event.target.value),
                  })
                }
                required
                step="0.01"
                type="number"
                value={item.setProgressionKg ?? ""}
              />
            </label>
            <label>
              <span>Passo entre sessões (kg)</span>
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
          {sequence ? (
            <output className="load-sequence" aria-live="polite">
              <span>Cargas sugeridas</span>
              <strong>{sequence} kg</strong>
            </output>
          ) : null}
          <small className="load-configuration-help">
            A progressão preenche as séries deste treino. O passo orienta a
            sugestão das próximas sessões. Toda carga continua editável.
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
          <PlanSelect
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
          </PlanSelect>
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
          <span>Descanso (HH:MM:SS)</span>
          <DurationInput
            maximum={maximumRestDurationSeconds}
            minimum={0}
            onChange={(restSeconds) => {
              if (restSeconds !== null) {
                onChange({ ...item, restSeconds });
              }
            }}
            required
            seconds={item.restSeconds}
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
            <span>Duração (HH:MM:SS)</span>
            <DurationInput
              maximum={maximumExerciseDurationSeconds}
              minimum={1}
              onChange={(durationSeconds) =>
                onChange({ ...item, durationSeconds })
              }
              required={item.modality === "time"}
              seconds={item.durationSeconds}
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

function LoadGuideDialog({
  onClose,
  onHide,
}: Readonly<{
  onClose: () => void;
  onHide: () => void;
}>) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="load-guide-title"
        aria-modal="true"
        className="session-dialog load-guide-dialog"
        role="dialog"
      >
        <div className="guide-dialog-heading">
          <span className="guide-dialog-icon">
            <AppIcon name="tip" />
          </span>
          <h2 id="load-guide-title">Carga, progressão e passo</h2>
        </div>
        <dl className="load-guide-list">
          <div>
            <dt>Carga inicial</dt>
            <dd>Ponto de partida da primeira série.</dd>
          </div>
          <div>
            <dt>Progressão entre séries</dt>
            <dd>Preenche automaticamente as próximas séries.</dd>
          </div>
          <div>
            <dt>Passo entre sessões</dt>
            <dd>Orienta a sugestão de carga dos próximos treinos.</dd>
          </div>
        </dl>
        <p>
          Toque em um exercício para configurar. As cargas são sugestões: você
          pode ajustá-las durante o treino.
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            onClick={onClose}
            ref={confirmRef}
            type="button"
          >
            OK
          </button>
          <button className="button-secondary" onClick={onHide} type="button">
            Não mostrar novamente
          </button>
        </div>
      </section>
    </div>
  );
}

function EditListGuideDialog({
  onClose,
  onHide,
}: Readonly<{
  onClose: () => void;
  onHide: () => void;
}>) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="session-dialog-backdrop" role="presentation">
      <section
        aria-describedby="edit-list-guide-copy"
        aria-labelledby="edit-list-guide-title"
        aria-modal="true"
        className="session-dialog"
        role="dialog"
      >
        <div className="guide-dialog-heading">
          <span className="guide-dialog-icon">
            <AppIcon name="tip" />
          </span>
          <h2 id="edit-list-guide-title">Edite com um toque</h2>
        </div>
        <p id="edit-list-guide-copy">
          Toque em um treino ou exercício para abrir a edição.
        </p>
        <div className="session-dialog-actions">
          <button
            className="button-primary"
            onClick={onClose}
            ref={confirmRef}
            type="button"
          >
            OK
          </button>
          <button className="button-secondary" onClick={onHide} type="button">
            Não mostrar novamente
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
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loadEditSnapshot, setLoadEditSnapshot] = useState<LoadEditSnapshot>();
  const [savedMessage, setSavedMessage] = useState("");
  const [noPlan, setNoPlan] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string>();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedPlanId, setArchivedPlanId] = useState<string>();
  const [loadGuideOpen, setLoadGuideOpen] = useState(false);
  const [editGuideOpen, setEditGuideOpen] = useState(false);
  const hasDraft = Boolean(draft);

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
          const nextDraft = result.value ?? blankDraft();
          setDraft(nextDraft);
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

  useEffect(() => {
    if (
      mode === "loads" &&
      window.localStorage.getItem(loadGuidePreferenceKey) !== "hidden"
    ) {
      setLoadGuideOpen(true);
    }
  }, [mode]);

  useEffect(() => {
    if (
      mode === "full" &&
      hasDraft &&
      window.localStorage.getItem(editGuidePreferenceKey) !== "hidden"
    ) {
      setEditGuideOpen(true);
    }
  }, [hasDraft, mode]);

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
    const validation = publishTrainingPlanInputSchema.safeParse(input);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      const sessionIndex =
        firstIssue?.path[0] === "sessions" &&
        typeof firstIssue.path[1] === "number"
          ? firstIssue.path[1]
          : undefined;
      const itemIndex =
        firstIssue?.path[2] === "items" &&
        typeof firstIssue.path[3] === "number"
          ? firstIssue.path[3]
          : undefined;
      const invalidSession =
        sessionIndex === undefined ? undefined : draft.sessions[sessionIndex];
      const invalidTrainingNumber =
        sessionIndex === undefined ? undefined : sessionIndex + 1;

      if (invalidSession) {
        setSelectedSessionId(invalidSession.sessionId);
        setSelectedItemId(
          (itemIndex === undefined
            ? undefined
            : invalidSession.items[itemIndex]
          )?.itemId ?? "",
        );
      }

      setError(
        invalidTrainingNumber
          ? `Revise os campos obrigatórios do Treino ${invalidTrainingNumber}.`
          : "Revise os campos obrigatórios antes de salvar.",
      );
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
    if (mode === "loads") {
      setDraft((current) =>
        current
          ? { ...current, currentVersion: result.value.version }
          : current,
      );
      setOperationId(`plan-publish:${randomUuid()}`);
      setSelectedSessionId("");
      setSelectedItemId("");
      setLoadEditSnapshot(undefined);
      setSavedMessage("Carga atualizada.");
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
      <AppShell active="workouts" variant="focused">
        <FocusedBackAction href="/treinos/" />
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
      <AppShell active="workouts" variant="focused">
        <FocusedBackAction href="/treinos/" />
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
      <AppShell active="workouts" variant="focused">
        <FocusedBackAction href="/treinos/" />
        <AppLoadingSkeleton label="Carregando plano" />
      </AppShell>
    );
  }

  if (archivedPlanId) {
    return (
      <AppShell active="workouts" variant="focused">
        <FocusedBackAction href="/treinos/" />
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
  const selectedLoad =
    mode === "loads" && selectedItemId
      ? strengthItems.find(({ item }) => item.itemId === selectedItemId)
      : undefined;
  const saveLabel =
    mode === "loads" ? "Salvar carga" : draft.planId ? "Salvar" : "Criar plano";
  function returnToPreviousLevel() {
    if (selectedItemId) {
      if (mode === "loads" && loadEditSnapshot) {
        updateItem(
          loadEditSnapshot.sessionId,
          loadEditSnapshot.item.itemId,
          loadEditSnapshot.item,
        );
        setLoadEditSnapshot(undefined);
      }
      setSelectedItemId("");
      if (mode === "loads") {
        setSelectedSessionId("");
      }
      return;
    }
    if (selectedSessionId) {
      setSelectedSessionId("");
      return;
    }
    navigate("/treinos/");
  }

  function openLoadEditor(sessionId: string, item: TrainingPlanDraftItem) {
    setSavedMessage("");
    setLoadEditSnapshot({ item: { ...item }, sessionId });
    setSelectedSessionId(sessionId);
    setSelectedItemId(item.itemId);
  }

  return (
    <AppShell
      active="workouts"
      hasFixedAction={mode === "full" || Boolean(selectedLoad)}
      variant="focused"
    >
      <FocusedBackAction onClick={returnToPreviousLevel} />
      <div className="plan-editor-page">
        <header className="plan-editor-header">
          <div className="plan-editor-title">
            <p className="eyebrow">
              {selectedLoad
                ? "Configurar carga"
                : mode === "loads"
                  ? "Cargas do plano"
                  : draft.planId
                    ? `Versão ${draft.currentVersion}`
                    : "Novo plano"}
            </p>
            <h1>
              {selectedLoad
                ? selectedLoad.item.exerciseName
                : mode === "loads"
                  ? "Configurar cargas"
                  : "Montar plano"}
            </h1>
          </div>
        </header>

        <form
          className="plan-editor-form"
          id="training-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            void publish();
          }}
        >
          {mode === "full" && !selectedSessionId ? (
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
            <section className="load-settings-list">
              {strengthItems.length > 0 ? (
                selectedLoad ? (
                  <article
                    className="load-settings-card load-settings-detail"
                    key={selectedLoad.item.itemId}
                  >
                    <div>
                      <small>
                        {selectedLoad.session.name} ·{" "}
                        {trainingSlotLabel(selectedLoad.session.dayOrder)}
                      </small>
                      <h2>{exerciseSummary(selectedLoad.item)}</h2>
                    </div>
                    <LoadConfiguration
                      item={selectedLoad.item}
                      onChange={(changed) =>
                        updateItem(
                          selectedLoad.session.sessionId,
                          selectedLoad.item.itemId,
                          changed,
                        )
                      }
                    />
                  </article>
                ) : (
                  <EditorEntityList
                    actionLabel={(option) =>
                      `Editar carga de ${option.primary}`
                    }
                    ariaLabel="Exercícios com configuração de carga"
                    onSelect={(itemId) => {
                      const selected = strengthItems.find(
                        ({ item }) => item.itemId === itemId,
                      );
                      if (selected) {
                        openLoadEditor(
                          selected.session.sessionId,
                          selected.item,
                        );
                      }
                    }}
                    options={strengthItems.map(({ item, session }, index) => ({
                      id: item.itemId,
                      index: index + 1,
                      primary: item.exerciseName,
                      secondary: `${session.name} · ${loadSummary(item)}`,
                    }))}
                    variant="exercise"
                  />
                )
              ) : (
                <div className="plan-editor-empty">
                  <h2>Este plano não tem exercícios de força.</h2>
                  <Link className="button-secondary" href="/treinos/">
                    Voltar para Treinos
                  </Link>
                </div>
              )}
              {savedMessage && !selectedLoad ? (
                <p className="status-message status-success" role="status">
                  {savedMessage}
                </p>
              ) : null}
            </section>
          ) : (
            <div className="plan-session-list">
              {!selectedSessionId ? (
                <EditorEntityList
                  ariaLabel="Selecionar treino para editar"
                  onSelect={(sessionId) => {
                    setSelectedSessionId(sessionId);
                    setSelectedItemId("");
                  }}
                  options={draft.sessions.map((session, index) => ({
                    id: session.sessionId,
                    index: index + 1,
                    primary: session.name,
                    secondary: `${trainingSlotLabel(session.dayOrder)} · ${session.items.length} ${session.items.length === 1 ? "exercício" : "exercícios"}`,
                  }))}
                  variant="session"
                />
              ) : null}
              {(() => {
                if (!selectedSessionId) {
                  return null;
                }
                const session = draft.sessions.find(
                  (candidate) => candidate.sessionId === selectedSessionId,
                );
                if (!session) {
                  return null;
                }
                const sessionIndex = draft.sessions.findIndex(
                  (candidate) => candidate.sessionId === session.sessionId,
                );
                const item = selectedItemId
                  ? session.items.find(
                      (candidate) => candidate.itemId === selectedItemId,
                    )
                  : undefined;
                return (
                  <section className="plan-session-editor">
                    {!item ? (
                      <>
                        <div className="plan-editor-card-heading">
                          <div>
                            <small className="plan-editor-position">
                              {session.items.length}{" "}
                              {session.items.length === 1
                                ? "exercício"
                                : "exercícios"}
                            </small>
                            <h2>Treino {sessionIndex + 1}</h2>
                          </div>
                        </div>
                        <div className="plan-field-grid plan-field-grid-two">
                          <label>
                            <span>Dia da semana</span>
                            <PlanSelect
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
                            </PlanSelect>
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
                        <button
                          className="button-text button-danger-text plan-remove-action"
                          disabled={draft.sessions.length === 1}
                          onClick={() => {
                            const remaining = draft.sessions.filter(
                              (current) =>
                                current.sessionId !== session.sessionId,
                            );
                            setDraft({ ...draft, sessions: remaining });
                            setSelectedSessionId("");
                            setSelectedItemId("");
                          }}
                          type="button"
                        >
                          <AppIcon name="trash" size={18} />
                          <span>Remover treino</span>
                        </button>
                        <EditorEntityList
                          ariaLabel={`Exercícios de ${session.name}`}
                          onSelect={setSelectedItemId}
                          options={session.items.map((candidate, index) => ({
                            id: candidate.itemId,
                            index: index + 1,
                            primary: candidate.exerciseName || "Novo exercício",
                            secondary: exerciseSummary(candidate),
                          }))}
                          variant="exercise"
                        />
                      </>
                    ) : null}
                    {item ? (
                      <div className="plan-exercise-list">
                        <ExerciseEditor
                          canRemove={session.items.length > 1}
                          item={item}
                          onChange={(changed) =>
                            updateItem(session.sessionId, item.itemId, changed)
                          }
                          onRemove={() => {
                            const remaining = session.items
                              .filter(
                                (candidate) => candidate.itemId !== item.itemId,
                              )
                              .map((candidate, index) => ({
                                ...candidate,
                                order: index + 1,
                              }));
                            updateSession(session.sessionId, (current) => ({
                              ...current,
                              items: remaining,
                            }));
                            setSelectedItemId("");
                          }}
                        />
                      </div>
                    ) : null}
                    {!item ? (
                      <button
                        className="button-secondary"
                        onClick={() => {
                          const added = blankItem(session.items.length + 1);
                          updateSession(session.sessionId, (current) => ({
                            ...current,
                            items: [...current.items, added],
                          }));
                          setSelectedItemId(added.itemId);
                        }}
                        type="button"
                      >
                        <AppIcon name="plus" />
                        <span>Adicionar exercício</span>
                      </button>
                    ) : null}
                  </section>
                );
              })()}
              {!selectedSessionId ? (
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
                    const addedSession = {
                      dayOrder: nextDay,
                      items: [blankItem(1)],
                      name: `Treino ${String.fromCharCode(65 + draft.sessions.length)}`,
                      sessionId: randomUuid(),
                    };
                    setDraft({
                      ...draft,
                      sessions: [...draft.sessions, addedSession],
                    });
                    setSelectedSessionId(addedSession.sessionId);
                    setSelectedItemId("");
                  }}
                  type="button"
                >
                  <AppIcon name="plus" />
                  <span>Adicionar treino</span>
                </button>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="status-message status-error" role="alert">
              {error}
            </p>
          ) : null}

          {mode === "full" && draft.planId && !selectedSessionId ? (
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => setArchiveOpen(true)}
              type="button"
            >
              Arquivar plano
            </button>
          ) : null}
        </form>
      </div>
      {mode === "full" || selectedLoad ? (
        <FixedActionBar>
          <button
            aria-busy={busy}
            className="button-primary"
            disabled={busy}
            form="training-plan-form"
            type="submit"
          >
            {busy ? "Salvando…" : saveLabel}
          </button>
        </FixedActionBar>
      ) : null}
      {archiveOpen ? (
        <ArchiveDialog
          busy={busy}
          onClose={() => setArchiveOpen(false)}
          onConfirm={() => void archive()}
        />
      ) : null}
      {loadGuideOpen ? (
        <LoadGuideDialog
          onClose={() => setLoadGuideOpen(false)}
          onHide={() => {
            window.localStorage.setItem(loadGuidePreferenceKey, "hidden");
            setLoadGuideOpen(false);
          }}
        />
      ) : null}
      {editGuideOpen ? (
        <EditListGuideDialog
          onClose={() => setEditGuideOpen(false)}
          onHide={() => {
            window.localStorage.setItem(editGuidePreferenceKey, "hidden");
            setEditGuideOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
