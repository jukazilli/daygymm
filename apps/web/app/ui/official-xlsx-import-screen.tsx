"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type {
  ImportedTrainingPlan,
  OfficialXlsxPlanProposal,
  PlanSourceGateway,
  TrainingPlanGateway,
} from "@daygym/contracts";

import {
  parseOfficialXlsxFile,
  type ParsedOfficialXlsx,
} from "../../lib/official-xlsx-parser";
import { createWebPlanSourceGateway } from "../../lib/plan-source-gateway";
import { createWebTrainingPlanGateway } from "../../lib/training-plan-gateway";
import { trainingWeekdayName } from "../../lib/training-weekdays";
import { AppLoadingSkeleton, AppShell } from "./app-shell";

interface OfficialXlsxImportScreenProps {
  readonly navigate?: (path: string) => void;
  readonly planSourceGateway?: PlanSourceGateway;
  readonly trainingPlanGateway?: TrainingPlanGateway;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function itemSummary(
  item: OfficialXlsxPlanProposal["sessions"][number]["items"][number],
) {
  if (item.repsMin !== null && item.repsMax !== null) {
    const weight = item.plannedWeightKg ? ` · ${item.plannedWeightKg} kg` : "";
    return `${item.sets} × ${item.repsMin}–${item.repsMax}${weight}`;
  }
  if (item.durationSeconds !== null) {
    return `${item.sets} × ${item.durationSeconds}s`;
  }
  if (item.distanceMeters !== null) {
    return `${item.sets} × ${item.distanceMeters}m`;
  }
  return `${item.sets} séries`;
}

export function OfficialXlsxImportScreen({
  navigate = defaultNavigate,
  planSourceGateway: providedPlanSourceGateway,
  trainingPlanGateway: providedTrainingPlanGateway,
}: OfficialXlsxImportScreenProps) {
  const sourceGatewayRef = useRef<PlanSourceGateway | undefined>(
    providedPlanSourceGateway,
  );
  const planGatewayRef = useRef<TrainingPlanGateway | undefined>(
    providedTrainingPlanGateway,
  );
  const [accessReady, setAccessReady] = useState(false);
  const [parsed, setParsed] = useState<ParsedOfficialXlsx>();
  const [result, setResult] = useState<ImportedTrainingPlan>();
  const [feedback, setFeedback] = useState<string>();
  const [phase, setPhase] = useState<"idle" | "parsing" | "saving">("idle");
  const canConfirm =
    parsed?.proposal !== null &&
    parsed?.proposal !== undefined &&
    parsed.planName.trim().length > 0;
  const blockingIssueCount =
    parsed?.issues.filter((issue) => issue.severity === "blocking").length ?? 0;

  function sourceGateway() {
    sourceGatewayRef.current ??= createWebPlanSourceGateway();
    return sourceGatewayRef.current;
  }

  function planGateway() {
    planGatewayRef.current ??= createWebTrainingPlanGateway();
    return planGatewayRef.current;
  }

  useEffect(() => {
    let active = true;
    void sourceGateway()
      .load()
      .then((sourceResult) => {
        if (!active) {
          return;
        }
        if (!sourceResult.ok) {
          navigate(
            sourceResult.reason === "session" ? "/entrar/" : "/treinos/",
          );
          return;
        }
        if (sourceResult.value.source !== "official_xlsx") {
          navigate("/treinos/");
          return;
        }
        setAccessReady(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setFeedback(undefined);
    setResult(undefined);
    setPhase("parsing");
    try {
      setParsed(await parseOfficialXlsxFile(file));
    } catch {
      setParsed(undefined);
      setFeedback("Não foi possível ler esta planilha. Escolha outro arquivo.");
    } finally {
      setPhase("idle");
    }
  }

  function changePlanName(planName: string) {
    setParsed((current) =>
      current
        ? {
            ...current,
            planName,
            proposal: current.proposal
              ? { ...current.proposal, planName }
              : null,
          }
        : current,
    );
  }

  async function confirmImport() {
    if (!parsed?.proposal || phase !== "idle") {
      return;
    }
    setFeedback(undefined);
    setPhase("saving");
    const importResult = await planGateway().importOfficialXlsx(
      parsed.proposal,
    );
    setPhase("idle");
    if (!importResult.ok) {
      if (importResult.reason === "session") {
        navigate("/entrar/");
        return;
      }
      setFeedback(
        importResult.reason === "invalid"
          ? "A proposta não passou pela validação final. Revise o arquivo."
          : "Não foi possível importar agora. Tente novamente.",
      );
      return;
    }
    setResult(importResult.value);
  }

  return (
    <AppShell active="workouts">
      {!accessReady ? (
        <AppLoadingSkeleton label="Preparando importação" />
      ) : null}
      {accessReady && result ? (
        <section className="app-state-card import-success-card">
          <span className="import-success-mark" aria-hidden="true">
            ✓
          </span>
          <p className="eyebrow">Plano importado</p>
          <h1>{result.name}</h1>
          <p>
            {result.sessionCount} sessões · {result.itemCount} exercícios ·
            versão {result.version}
          </p>
          {!result.wasCreated ? (
            <p className="import-duplicate-note">
              Esta planilha já estava salva.
            </p>
          ) : null}
          <Link className="button-primary" href="/treinos/">
            Abrir plano
          </Link>
        </section>
      ) : null}
      {accessReady && !result ? (
        <div className="import-layout">
          <section className="import-header">
            <p className="eyebrow">Planilha oficial</p>
            <h1>Importe seu plano.</h1>
            <p>O arquivo é lido neste aparelho e não é enviado.</p>
            <div className="import-template-actions">
              <a
                className="button-secondary"
                download
                href="/templates/daygym-modelo-oficial-treino.xlsx"
              >
                Baixar modelo
              </a>
              <a className="button-text" href="#exemplo-planilha">
                Ver exemplo
              </a>
            </div>
          </section>

          {phase === "parsing" ? (
            <AppLoadingSkeleton label="Lendo e validando a planilha" />
          ) : (
            <label className="import-file-picker">
              <input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => void selectFile(event)}
                type="file"
              />
              <span className="import-file-icon" aria-hidden="true">
                ↑
              </span>
              <strong>
                {parsed ? "Trocar planilha" : "Selecionar planilha"}
              </strong>
              <small>.xlsx · até 2 MB</small>
            </label>
          )}

          {parsed ? (
            <section
              className="import-preview"
              aria-labelledby="import-preview-title"
            >
              <div className="import-preview-heading">
                <div>
                  <p className="eyebrow">Prévia</p>
                  <h2 id="import-preview-title">
                    {parsed.sessions.length} sessões encontradas
                  </h2>
                </div>
                <label className="compact-field">
                  <span>Nome do treino</span>
                  <input
                    maxLength={80}
                    onChange={(event) => changePlanName(event.target.value)}
                    value={parsed.planName}
                  />
                </label>
              </div>

              {parsed.issues.length > 0 ? (
                <details className="import-issues">
                  <summary>
                    <span>
                      {blockingIssueCount > 0
                        ? "Houve erros durante a importação"
                        : "Há avisos para revisar"}
                    </span>
                    <small>
                      {parsed.issues.length}{" "}
                      {parsed.issues.length === 1 ? "item" : "itens"}
                    </small>
                  </summary>
                  <div className="import-issue-list">
                    {parsed.issues.map((issue, index) => (
                      <p
                        data-severity={issue.severity}
                        key={`${issue.row ?? "file"}-${index}`}
                      >
                        {issue.row ? `Linha ${issue.row}: ` : ""}
                        {issue.message}
                      </p>
                    ))}
                  </div>
                </details>
              ) : null}

              <div
                aria-label="Treinos encontrados"
                className="import-session-list"
                role="region"
                tabIndex={0}
              >
                {parsed.sessions.map((session) => (
                  <article
                    className="import-session-card"
                    key={session.dayOrder}
                  >
                    <div>
                      <span>
                        {trainingWeekdayName(((session.dayOrder - 1) % 7) + 1)}
                      </span>
                      <h3>{session.name}</h3>
                    </div>
                    <ul>
                      {session.items.map((item) => (
                        <li key={item.order}>
                          <span>{item.exerciseName}</span>
                          <strong>{itemSummary(item)}</strong>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              {feedback ? (
                <p className="status-message status-error" role="alert">
                  {feedback}
                </p>
              ) : null}
              <button
                className="button-primary import-confirm-button"
                disabled={!canConfirm || phase === "saving"}
                onClick={() => void confirmImport()}
                type="button"
              >
                {phase === "saving" ? "Importando…" : "Confirmar importação"}
              </button>
            </section>
          ) : null}

          {!parsed && feedback ? (
            <p className="status-message status-error" role="alert">
              {feedback}
            </p>
          ) : null}

          <section className="import-example" id="exemplo-planilha">
            <p className="eyebrow">Exemplo</p>
            <h2>Uma linha por exercício</h2>
            <div className="import-example-row" aria-label="Exemplo de linha">
              <span>1 · Treino A</span>
              <strong>Agachamento livre</strong>
              <span>3 × 8–12 · 90s</span>
            </div>
            <p>
              Fórmulas, macros, links, proteção e objetos bloqueiam a
              importação.
            </p>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
