import {
  importedTrainingPlanSchema,
  publishTrainingPlanInputSchema,
  trainingPlanDraftSchema,
  type PublishTrainingPlanInput,
  type TrainingPlanDraftItem,
  type TrainingPlanEditorGateway,
  type TrainingPlanFailure,
  type TrainingPlanResult,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import type {
  TrainingPlanArchiveRpcRow,
  TrainingPlanImportRpcRow,
  TrainingPlanItemRow,
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

function mapItem(row: TrainingPlanItemRow): TrainingPlanDraftItem {
  const strength = row.modality === "strength";
  return {
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
    sets: row.sets,
  };
}

function rpcSessions(input: PublishTrainingPlanInput) {
  return input.sessions.map((session) => ({
    day_order: session.dayOrder,
    items: session.items.map((item, itemIndex) => ({
      circuit_group: item.circuitGroup,
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

    async load() {
      try {
        const client = getWebSupabaseClient();
        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();
        if (sessionError || !sessionData.session) {
          return { ok: false, reason: "session" };
        }
        const { data: planData, error: planError } = await client
          .from("training_plans")
          .select(
            "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,created_at,updated_at,archived_at",
          )
          .is("archived_at", null)
          .maybeSingle();
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
        const [sessionsResult, itemsResult] = await Promise.all([
          client
            .from("training_plan_sessions")
            .select("session_id,version_id,user_id,day_order,name")
            .eq("version_id", versionId)
            .order("day_order"),
          client
            .from("training_plan_items")
            .select(
              "item_id,session_id,version_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,planned_weight_kg,load_mode,load_increment_kg,duration_seconds,distance_meters,rest_seconds,circuit_group,notes",
            )
            .eq("version_id", versionId)
            .order("item_order"),
        ]);
        const queryError = sessionsResult.error ?? itemsResult.error;
        if (queryError) {
          return failure(queryError);
        }
        const items = (itemsResult.data ?? []) as TrainingPlanItemRow[];
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
                .map(mapItem),
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
        const { data, error } = await client.rpc(
          "publish_training_plan_version",
          {
            p_change_summary: input.changeSummary,
            p_content_sha256: contentSha256,
            p_operation_id: input.operationId,
            p_plan_id: input.planId,
            p_plan_name: input.name,
            p_sessions: sessions,
          },
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
        const { data, error } = await client.rpc("restore_training_plan", {
          p_plan_id: planId,
        });
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
