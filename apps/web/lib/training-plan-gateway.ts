import {
  importedTrainingPlanSchema,
  officialXlsxPlanProposalSchema,
  type OfficialXlsxPlanProposal,
  type TrainingPlanFailure,
  type TrainingPlanGateway,
  type TrainingPlanResult,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import type {
  TrainingPlanImportRpcRow,
  TrainingPlanRow,
} from "./supabase-database";

function failureFromError(error: unknown): TrainingPlanFailure {
  if (error && typeof error === "object") {
    const status = "status" in error ? error.status : undefined;
    const code = "code" in error ? error.code : undefined;
    if (
      status === 401 ||
      status === 403 ||
      code === "42501" ||
      code === "PGRST301"
    ) {
      return "session";
    }
    if (code === "22023" || code === "23514" || code === "23505") {
      return "invalid";
    }
  }
  return "unexpected";
}

function failure<T>(error: unknown): TrainingPlanResult<T> {
  return { ok: false, reason: failureFromError(error) };
}

function rpcSessions(proposal: OfficialXlsxPlanProposal) {
  return proposal.sessions.map((session) => ({
    day_order: session.dayOrder,
    items: session.items.map((item) => ({
      circuit_group: item.circuitGroup,
      distance_meters: item.distanceMeters,
      duration_seconds: item.durationSeconds,
      exercise_name: item.exerciseName,
      modality: item.modality,
      notes: item.notes,
      order: item.order,
      reps_max: item.repsMax,
      reps_min: item.repsMin,
      rest_seconds: item.restSeconds,
      sets: item.sets,
    })),
    name: session.name,
  }));
}

function mapRpcRow(row: TrainingPlanImportRpcRow) {
  return importedTrainingPlanSchema.parse({
    itemCount: row.item_count,
    name: row.plan_name,
    planId: row.plan_id,
    sessionCount: row.session_count,
    version: row.plan_version,
    versionId: row.version_id,
    wasCreated: row.was_created,
  });
}

function mapPlanRow(row: TrainingPlanRow) {
  if (!row.active_version_id) {
    return null;
  }
  return importedTrainingPlanSchema.parse({
    itemCount: row.item_count,
    name: row.name,
    planId: row.plan_id,
    sessionCount: row.session_count,
    version: row.current_version,
    versionId: row.active_version_id,
    wasCreated: false,
  });
}

export function createWebTrainingPlanGateway(): TrainingPlanGateway {
  return {
    async importOfficialXlsx(input) {
      try {
        const proposal = officialXlsxPlanProposalSchema.parse(input);
        const client = getWebSupabaseClient();
        const { data, error } = await client.rpc("import_official_xlsx_plan", {
          p_operation_id: proposal.operationId,
          p_plan_name: proposal.planName,
          p_sessions: rpcSessions(proposal),
          p_source_file_name: proposal.sourceFileName,
          p_source_sha256: proposal.sourceSha256,
          p_source_size_bytes: proposal.sourceSizeBytes,
        });
        const row = data?.[0];
        if (error || !row) {
          return failure(error);
        }
        return { ok: true, value: mapRpcRow(row) };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return { ok: false, reason: "invalid" };
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async loadActive() {
      try {
        const client = getWebSupabaseClient();
        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();
        if (sessionError || !sessionData.session) {
          return { ok: false, reason: "session" };
        }
        const { data, error } = await client
          .from("training_plans")
          .select(
            "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          return failure(error);
        }
        return {
          ok: true,
          value: data ? mapPlanRow(data as TrainingPlanRow) : null,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },
  };
}
