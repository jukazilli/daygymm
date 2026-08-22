import {
  importedTrainingPlanSchema,
  publishTrainingPlanInputSchema,
  trainingPlanDraftSchema,
  trainingPlanSummarySchema,
  type PublishTrainingPlanInput,
  type TrainingPlanDraftItem,
  type TrainingPlanEditorGateway,
  type TrainingPlanFailure,
  type TrainingPlanResult,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import { retryIdempotentSupabaseRequest } from "./supabase-resilience";
import type {
  TrainingPlanArchiveRpcRow,
  TrainingPlanImportRpcRow,
  TrainingPlanItemRow,
  TrainingPlanItemAlternativeRow,
  TrainingPlanRestoreRpcRow,
  TrainingPlanRow,
  TrainingPlanSessionRow,
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

function mapItem(
  row: TrainingPlanItemRow,
  alternatives: readonly TrainingPlanItemAlternativeRow[],
): TrainingPlanDraftItem {
  const strength = row.modality === "strength";
  return {
    alternatives: alternatives
      .filter((alternative) => alternative.plan_item_id === row.item_id)
      .sort((left, right) => left.alternative_order - right.alternative_order)
      .map((alternative) => ({
        alternativeId: alternative.alternative_id,
        exerciseName: alternative.exercise_name,
        order: alternative.alternative_order,
      })),
    circuitGroup: row.circuit_group,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    exerciseName: row.exercise_name,
    itemId: row.item_id,
    loadIncrementKg: strength ? row.load_increment_kg : null,
    loadMode: strength ? row.load_mode : "none",
    modality: row.modality as TrainingPlanDraftItem["modality"],
    notes: row.notes,
    order: row.item_order,
    plannedWeightKg: strength ? row.planned_weight_kg : null,
    repsMax: row.reps_max,
    repsMin: row.reps_min,
    restSeconds: row.rest_seconds,
    setProgressionKg: strength ? row.set_progression_kg : null,
    sets: row.sets,
  };
}

function rpcSessions(input: PublishTrainingPlanInput) {
  return input.sessions.map((session) => ({
    day_order: session.dayOrder,
    items: session.items.map((item, itemIndex) => ({
      circuit_group: item.circuitGroup,
      alternatives: item.alternatives.map((alternative, index) => ({
        alternative_id: alternative.alternativeId,
        exercise_name: alternative.exerciseName,
        order: index + 1,
      })),
      distance_meters: item.distanceMeters,
      duration_seconds: item.durationSeconds,
      exercise_name: item.exerciseName,
      load_increment_kg: item.loadIncrementKg,
      load_mode: item.loadMode,
      modality: item.modality,
      notes: item.notes,
      order: itemIndex + 1,
      planned_weight_kg: item.plannedWeightKg,
      reps_max: item.repsMax,
      reps_min: item.repsMin,
      rest_seconds: item.restSeconds,
      set_progression_kg: item.setProgressionKg,
      sets: item.sets,
    })),
    name: session.name,
  }));
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function mapPublished(row: TrainingPlanImportRpcRow) {
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

export function createWebTrainingPlanEditorGateway(): TrainingPlanEditorGateway {
  return {
    async archive(planId) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await client.rpc("archive_training_plan", {
          p_plan_id: planId,
        });
        const row = data?.[0] as TrainingPlanArchiveRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: {
            archivedAt: row.archived_at,
            planId: row.plan_id,
            wasChanged: row.was_changed,
          },
        };
      } catch {
        return { ok: false, reason: "configuration" };
      }
    },

    async list() {
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
            "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,created_at,updated_at,archived_at",
          )
          .order("updated_at", { ascending: false });
        if (error) {
          return failure(error);
        }
        return {
          ok: true,
          value: ((data ?? []) as TrainingPlanRow[]).map((plan) =>
            trainingPlanSummarySchema.parse({
              archivedAt: plan.archived_at,
              currentVersion: plan.current_version,
              itemCount: plan.item_count,
              name: plan.name,
              planId: plan.plan_id,
              provenance: plan.provenance,
              sessionCount: plan.session_count,
              updatedAt: plan.updated_at,
            }),
          ),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async load(planId) {
      try {
        const client = getWebSupabaseClient();
        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();
        if (sessionError || !sessionData.session) {
          return { ok: false, reason: "session" };
        }
        let planQuery = client
          .from("training_plans")
          .select(
            "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,created_at,updated_at,archived_at",
          );
        planQuery = planId
          ? planQuery.eq("plan_id", planId).is("archived_at", null)
          : planQuery.is("archived_at", null);
        const { data: planData, error: planError } =
          await planQuery.maybeSingle();
        if (planError) {
          return failure(planError);
        }
        if (!planData?.active_version_id) {
          return { ok: true, value: null };
        }
        const plan = planData as TrainingPlanRow;
        if (!plan.active_version_id) {
          return { ok: true, value: null };
        }
        const versionId = plan.active_version_id;
        const [sessionsResult, itemsResult, alternativesResult] =
          await Promise.all([
            client
              .from("training_plan_sessions")
              .select("session_id,version_id,user_id,day_order,name")
              .eq("version_id", versionId)
              .order("day_order"),
            client
              .from("training_plan_items")
              .select(
                "item_id,session_id,version_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,planned_weight_kg,load_mode,load_increment_kg,set_progression_kg,duration_seconds,distance_meters,rest_seconds,circuit_group,notes",
              )
              .eq("version_id", versionId)
              .order("item_order"),
            client
              .from("training_plan_item_alternatives")
              .select(
                "alternative_id,plan_item_id,version_id,user_id,alternative_order,exercise_name",
              )
              .eq("version_id", versionId)
              .order("alternative_order"),
          ]);
        const queryError =
          sessionsResult.error ?? itemsResult.error ?? alternativesResult.error;
        if (queryError) {
          return failure(queryError);
        }
        const items = (itemsResult.data ?? []) as TrainingPlanItemRow[];
        const alternatives = (alternativesResult.data ??
          []) as TrainingPlanItemAlternativeRow[];
        return {
          ok: true,
          value: trainingPlanDraftSchema.parse({
            currentVersion: plan.current_version,
            name: plan.name,
            planId: plan.plan_id,
            sessions: (
              (sessionsResult.data ?? []) as TrainingPlanSessionRow[]
            ).map((session) => ({
              dayOrder: session.day_order,
              items: items
                .filter((item) => item.session_id === session.session_id)
                .map((item) => mapItem(item, alternatives)),
              name: session.name,
              sessionId: session.session_id,
            })),
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async publish(rawInput) {
      try {
        const input = publishTrainingPlanInputSchema.parse(rawInput);
        const sessions = rpcSessions(input);
        const contentSha256 = await sha256({
          changeSummary: input.changeSummary,
          name: input.name,
          planId: input.planId,
          sessions,
        });
        const client = getWebSupabaseClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("publish_training_plan_version_v3", {
            p_change_summary: input.changeSummary,
            p_content_sha256: contentSha256,
            p_operation_id: input.operationId,
            p_plan_id: input.planId,
            p_plan_name: input.name,
            p_sessions: sessions,
          }),
        );
        const row = data?.[0] as TrainingPlanImportRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return { ok: true, value: mapPublished(row) };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return { ok: false, reason: "invalid" };
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async restore(planId) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("restore_training_plan", {
            p_plan_id: planId,
          }),
        );
        const row = data?.[0] as TrainingPlanRestoreRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: { planId: row.plan_id, wasChanged: row.was_changed },
        };
      } catch {
        return { ok: false, reason: "configuration" };
      }
    },
  };
}
