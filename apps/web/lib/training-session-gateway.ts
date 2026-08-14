import {
  activeTrainingRunSchema,
  completedTrainingSessionSchema,
  exerciseCompletionSchema,
  practicalTrainingStateSchema,
  type PracticalTrainingExercise,
  type PracticalTrainingPlanSession,
  type TrainingSessionFailure,
  type TrainingSessionGateway,
  type TrainingSessionResult,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import type {
  CompletedTrainingSessionRow,
  ExerciseCompletionRpcRow,
  TrainingCancelRpcRow,
  TrainingFinishRpcRow,
  TrainingPlanItemRow,
  TrainingPlanRow,
  TrainingPlanScheduleEntryRow,
  TrainingPlanSessionRow,
  TrainingSessionRunItemRow,
  TrainingSessionRunRow,
  TrainingStartRpcRow,
} from "./supabase-database";

function failureFromError(error: unknown): TrainingSessionFailure {
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
    if (code === "23505" || code === "23514") {
      return "conflict";
    }
    if (code === "22023") {
      return "invalid";
    }
  }
  return "unexpected";
}

function failure<T>(error: unknown): TrainingSessionResult<T> {
  return { ok: false, reason: failureFromError(error) };
}

function randomUuid() {
  return globalThis.crypto.randomUUID();
}

function mapPlan(row: TrainingPlanRow) {
  if (!row.active_version_id) {
    return null;
  }
  return {
    itemCount: row.item_count,
    name: row.name,
    planId: row.plan_id,
    sessionCount: row.session_count,
    version: row.current_version,
    versionId: row.active_version_id,
    wasCreated: false,
  };
}

function mapPlanItem(
  row: TrainingPlanItemRow,
  completedAt: string | null = null,
): PracticalTrainingExercise {
  return {
    circuitGroup: row.circuit_group,
    completedAt,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    exerciseName: row.exercise_name,
    itemId: row.item_id,
    modality: row.modality as PracticalTrainingExercise["modality"],
    notes: row.notes,
    order: row.item_order,
    repsMax: row.reps_max,
    repsMin: row.reps_min,
    restSeconds: row.rest_seconds,
    sets: row.sets,
  };
}

function mapRunItem(row: TrainingSessionRunItemRow): PracticalTrainingExercise {
  return {
    circuitGroup: row.circuit_group,
    completedAt: row.completed_at,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    exerciseName: row.exercise_name,
    itemId: row.plan_item_id,
    modality: row.modality as PracticalTrainingExercise["modality"],
    notes: row.notes,
    order: row.item_order,
    repsMax: row.reps_max,
    repsMin: row.reps_min,
    restSeconds: row.rest_seconds,
    sets: row.sets,
  };
}

function buildSessions(
  sessionRows: TrainingPlanSessionRow[],
  itemRows: TrainingPlanItemRow[],
  scheduleRows: TrainingPlanScheduleEntryRow[],
): PracticalTrainingPlanSession[] {
  const weekdayBySession = new Map(
    scheduleRows.map((entry) => [entry.planned_session_id, entry.weekday]),
  );
  return sessionRows.map((session) => {
    const fallbackWeekday = ((session.day_order - 1) % 7) + 1;
    return {
      dayOrder: session.day_order,
      items: itemRows
        .filter((item) => item.session_id === session.session_id)
        .sort((left, right) => left.item_order - right.item_order)
        .map((item) => mapPlanItem(item)),
      name: session.name,
      sessionId: session.session_id,
      weekday: weekdayBySession.get(session.session_id) ?? fallbackWeekday,
    };
  });
}

function selectedSession(
  sessions: PracticalTrainingPlanSession[],
  preferredSessionId?: string,
) {
  const preferred = sessions.find(
    (session) => session.sessionId === preferredSessionId,
  );
  if (preferred) {
    return preferred;
  }
  const browserDay = new Date().getDay();
  const weekday = browserDay === 0 ? 7 : browserDay;
  return sessions.find((session) => session.weekday === weekday) ?? null;
}

export function createWebTrainingSessionGateway(): TrainingSessionGateway {
  const load: TrainingSessionGateway["load"] = async (preferredSessionId) => {
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
          "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planError) {
        return failure(planError);
      }
      if (!planData?.active_version_id) {
        return {
          ok: true,
          value: practicalTrainingStateSchema.parse({
            activeRun: null,
            lastCompletedAt: null,
            nextSession: null,
            plan: null,
            sessions: [],
          }),
        };
      }

      const planRow = planData as TrainingPlanRow;
      const activeVersionId = planRow.active_version_id;
      if (!activeVersionId) {
        return { ok: false, reason: "conflict" };
      }
      const [
        sessionsResult,
        itemsResult,
        scheduleResult,
        runResult,
        completedResult,
      ] = await Promise.all([
        client
          .from("training_plan_sessions")
          .select("session_id,version_id,user_id,day_order,name")
          .eq("version_id", activeVersionId)
          .order("day_order"),
        client
          .from("training_plan_items")
          .select(
            "item_id,session_id,version_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,duration_seconds,distance_meters,rest_seconds,circuit_group,notes",
          )
          .eq("version_id", activeVersionId)
          .order("item_order"),
        client
          .from("training_plan_schedule_entries")
          .select(
            "schedule_entry_id,version_id,planned_session_id,user_id,weekday,slot_order",
          )
          .eq("version_id", activeVersionId)
          .order("weekday")
          .order("slot_order"),
        client
          .from("training_session_runs")
          .select(
            "run_id,user_id,plan_id,plan_version_id,planned_session_id,operation_id,started_at,updated_at",
          )
          .limit(1)
          .maybeSingle(),
        client
          .from("training_sessions")
          .select(
            "session_id,user_id,plan_id,plan_version_id,planned_session_id,started_at,completed_at,exercise_count,completed_exercise_count,duration_seconds",
          )
          .eq("plan_version_id", activeVersionId)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const queryError =
        sessionsResult.error ??
        itemsResult.error ??
        scheduleResult.error ??
        runResult.error ??
        completedResult.error;
      if (queryError) {
        return failure(queryError);
      }

      const sessions = buildSessions(
        (sessionsResult.data ?? []) as TrainingPlanSessionRow[],
        (itemsResult.data ?? []) as TrainingPlanItemRow[],
        (scheduleResult.data ?? []) as TrainingPlanScheduleEntryRow[],
      );
      const runRow = runResult.data as TrainingSessionRunRow | null;
      const lastCompleted =
        completedResult.data as CompletedTrainingSessionRow | null;
      let activeRun = null;

      if (runRow) {
        const { data: runItemsData, error: runItemsError } = await client
          .from("training_session_run_items")
          .select(
            "run_id,plan_item_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,duration_seconds,distance_meters,rest_seconds,circuit_group,notes,completed_at",
          )
          .eq("run_id", runRow.run_id)
          .order("item_order");
        if (runItemsError) {
          return failure(runItemsError);
        }
        const planned = sessions.find(
          (session) => session.sessionId === runRow.planned_session_id,
        );
        if (!planned) {
          return { ok: false, reason: "conflict" };
        }
        activeRun = activeTrainingRunSchema.parse({
          runId: runRow.run_id,
          session: {
            ...planned,
            items: (runItemsData ?? []).map((item) =>
              mapRunItem(item as TrainingSessionRunItemRow),
            ),
          },
          startedAt: runRow.started_at,
        });
      }

      return {
        ok: true,
        value: practicalTrainingStateSchema.parse({
          activeRun,
          lastCompletedAt: lastCompleted?.completed_at ?? null,
          nextSession:
            activeRun?.session ?? selectedSession(sessions, preferredSessionId),
          plan: mapPlan(planRow),
          sessions,
        }),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return failure(error);
      }
      return { ok: false, reason: "configuration" };
    }
  };

  return {
    load,
    async cancel(runId) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await client.rpc("cancel_training_session", {
          p_run_id: runId,
        });
        const row = data?.[0] as TrainingCancelRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: { runId: row.run_id, wasCancelled: row.was_cancelled },
        };
      } catch {
        return { ok: false, reason: "configuration" };
      }
    },
    async start(plannedSessionId) {
      try {
        const client = getWebSupabaseClient();
        const runId = randomUuid();
        const { data, error } = await client.rpc("start_training_session", {
          p_operation_id: `training-start:${runId}`,
          p_planned_session_id: plannedSessionId,
          p_run_id: runId,
        });
        const row = data?.[0] as TrainingStartRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        const state = await load();
        if (!state.ok) {
          return state;
        }
        if (!state.value.activeRun) {
          return { ok: false, reason: "unexpected" };
        }
        return { ok: true, value: state.value.activeRun };
      } catch {
        return { ok: false, reason: "configuration" };
      }
    },

    async completeExercise(runId, itemId) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await client.rpc("complete_training_exercise", {
          p_plan_item_id: itemId,
          p_run_id: runId,
        });
        const row = data?.[0] as ExerciseCompletionRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: exerciseCompletionSchema.parse({
            completedCount: row.completed_count,
            totalCount: row.total_count,
            wasCreated: row.was_created,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async finish(runId) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await client.rpc("finish_training_session", {
          p_correlation_id: randomUuid(),
          p_event_id: randomUuid(),
          p_operation_id: `training-finish:${runId}`,
          p_run_id: runId,
          p_session_id: runId,
        });
        const row = data?.[0] as TrainingFinishRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: completedTrainingSessionSchema.parse({
            completedAt: row.completed_at,
            durationSeconds: row.duration_seconds,
            sessionId: row.session_id,
            wasCreated: row.was_created,
          }),
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
