import {
  activeTrainingRunSchema,
  completedTrainingSessionSchema,
  exerciseCompletionSchema,
  exerciseStartSchema,
  exerciseSubstitutionInputSchema,
  exerciseSubstitutionResultSchema,
  practicalTrainingStateSchema,
  setCompletionInputSchema,
  setCompletionSchema,
  setRevisionInputSchema,
  setRevisionSchema,
  type PracticalTrainingExercise,
  type PracticalTrainingSet,
  type PracticalTrainingPlanSession,
  type ReplayableTrainingSessionGateway,
  type TrainingSessionFailure,
  type TrainingSessionGateway,
  type TrainingSessionResult,
} from "@daygym/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { retryIdempotentSupabaseRequest } from "./supabase-resilience";
import type {
  CompletedTrainingSessionRow,
  ExerciseCompletionRpcRow,
  ExerciseStartRpcRow,
  PreviousTrainingSetReferenceRpcRow,
  SetCompletionRpcRow,
  SetRevisionRpcRow,
  TrainingCancelRpcRow,
  TrainingFinishRpcRow,
  TrainingPauseRpcRow,
  TrainingPlanItemRow,
  TrainingPlanItemAlternativeRow,
  TrainingPlanRow,
  TrainingPlanScheduleEntryRow,
  TrainingPlanSessionRow,
  TrainingSessionRunItemRow,
  TrainingSessionRunSubstitutionRow,
  TrainingSessionRunSetRow,
  TrainingSessionRunRow,
  TrainingStartRpcRow,
  TrainingSubstitutionRpcRow,
} from "./supabase-training-database";

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
    if (code === "23505" || code === "23514" || code === "40001") {
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

function revisionOperationId(
  action: "correct" | "undo",
  setExecutionId: string,
  revision: number,
  values: {
    actualDistanceMeters: number | null;
    actualDurationSeconds: number | null;
    actualReps: number | null;
    actualWeightKg: number | null;
  },
) {
  const encodedValues = [
    values.actualReps,
    values.actualWeightKg,
    values.actualDurationSeconds,
    values.actualDistanceMeters,
  ]
    .map((value) => value ?? "n")
    .join(":");
  return `training-set-${action}:${setExecutionId}:${revision}:${encodedValues}`;
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
  alternatives: readonly TrainingPlanItemAlternativeRow[],
  completedAt: string | null = null,
): PracticalTrainingExercise {
  return {
    approvedAlternatives: alternatives
      .filter((alternative) => alternative.plan_item_id === row.item_id)
      .sort((left, right) => left.alternative_order - right.alternative_order)
      .map((alternative) => ({
        alternativeId: alternative.alternative_id,
        exerciseName: alternative.exercise_name,
        order: alternative.alternative_order,
      })),
    circuitGroup: row.circuit_group,
    completedAt,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    exerciseName: row.exercise_name,
    itemId: row.item_id,
    modality: row.modality as PracticalTrainingExercise["modality"],
    notes: row.notes,
    order: row.item_order,
    plannedExerciseName: row.exercise_name,
    plannedWeightKg: row.planned_weight_kg,
    previousSetReferences: [],
    repsMax: row.reps_max,
    repsMin: row.reps_min,
    restSeconds: row.rest_seconds,
    setProgressionKg: row.set_progression_kg,
    sets: row.sets,
    setExecutions: [],
    startedAt: null,
    substitution: null,
  };
}

function mapRunSet(row: TrainingSessionRunSetRow): PracticalTrainingSet {
  return {
    actualDistanceMeters: row.actual_distance_meters,
    actualDurationSeconds: row.actual_duration_seconds,
    actualReps: row.actual_reps,
    actualWeightKg: row.actual_weight_kg,
    completedAt: row.completed_at,
    plannedDistanceMeters: row.planned_distance_meters,
    plannedDurationSeconds: row.planned_duration_seconds,
    plannedRepsMax: row.planned_reps_max,
    plannedRepsMin: row.planned_reps_min,
    plannedWeightKg: row.planned_weight_kg,
    revision: row.revision,
    setExecutionId: row.set_execution_id,
    setNumber: row.set_number,
    updatedAt: row.updated_at,
  };
}

function mapRunItem(
  row: TrainingSessionRunItemRow,
  sets: TrainingSessionRunSetRow[],
  references: PreviousTrainingSetReferenceRpcRow[],
  alternatives: readonly TrainingPlanItemAlternativeRow[],
  substitutions: readonly TrainingSessionRunSubstitutionRow[],
): PracticalTrainingExercise {
  const substitution = substitutions.find(
    (candidate) => candidate.plan_item_id === row.plan_item_id,
  );
  return {
    approvedAlternatives: alternatives
      .filter((alternative) => alternative.plan_item_id === row.plan_item_id)
      .sort((left, right) => left.alternative_order - right.alternative_order)
      .map((alternative) => ({
        alternativeId: alternative.alternative_id,
        exerciseName: alternative.exercise_name,
        order: alternative.alternative_order,
      })),
    circuitGroup: row.circuit_group,
    completedAt: row.completed_at,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    exerciseName: substitution?.executed_exercise_name ?? row.exercise_name,
    itemId: row.plan_item_id,
    modality: row.modality as PracticalTrainingExercise["modality"],
    notes: row.notes,
    order: row.item_order,
    plannedExerciseName: row.exercise_name,
    plannedWeightKg: row.planned_weight_kg,
    previousSetReferences: substitution
      ? []
      : references
          .filter((reference) => reference.plan_item_id === row.plan_item_id)
          .sort((left, right) => left.set_number - right.set_number)
          .map((reference) => ({
            actualDistanceMeters: reference.actual_distance_meters,
            actualDurationSeconds: reference.actual_duration_seconds,
            actualReps: reference.actual_reps,
            actualWeightKg: reference.actual_weight_kg,
            completedAt: reference.completed_at,
            setNumber: reference.set_number,
            sourceSessionId: reference.source_session_id,
          })),
    repsMax: row.reps_max,
    repsMin: row.reps_min,
    restSeconds: row.rest_seconds,
    setProgressionKg: row.set_progression_kg,
    sets: row.sets,
    setExecutions: sets
      .filter((set) => set.plan_item_id === row.plan_item_id)
      .sort((left, right) => left.set_number - right.set_number)
      .map(mapRunSet),
    startedAt: row.started_at,
    substitution: substitution
      ? {
          alternativeId: substitution.alternative_id,
          exerciseName: substitution.executed_exercise_name,
          plannedExerciseName: substitution.planned_exercise_name,
          reason: substitution.reason,
          substitutedAt: substitution.substituted_at,
        }
      : null,
  };
}

function buildSessions(
  sessionRows: TrainingPlanSessionRow[],
  itemRows: TrainingPlanItemRow[],
  scheduleRows: TrainingPlanScheduleEntryRow[],
  alternativeRows: TrainingPlanItemAlternativeRow[],
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
        .map((item) => mapPlanItem(item, alternativeRows)),
      name: session.name,
      sessionId: session.session_id,
      weekday: weekdayBySession.get(session.session_id) ?? fallbackWeekday,
    };
  });
}

function selectedSession(
  sessions: PracticalTrainingPlanSession[],
  currentDate: Date,
  preferredSessionId?: string,
) {
  const preferred = sessions.find(
    (session) => session.sessionId === preferredSessionId,
  );
  if (preferred) {
    return preferred;
  }
  const browserDay = currentDate.getDay();
  const weekday = browserDay === 0 ? 7 : browserDay;
  return sessions.find((session) => session.weekday === weekday) ?? null;
}

export interface SupabaseTrainingSessionGatewayDependencies {
  // The SDK's five generic parameters are invariant across custom schemas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly getClient: () => SupabaseClient<any, any, any, any, any>;
  readonly now?: () => Date;
  readonly uuid?: () => string;
}

export function createSupabaseTrainingSessionGateway({
  getClient,
  now = () => new Date(),
  uuid = () => globalThis.crypto.randomUUID(),
}: SupabaseTrainingSessionGatewayDependencies): ReplayableTrainingSessionGateway {
  const load: TrainingSessionGateway["load"] = async (preferredSessionId) => {
    try {
      const client = getClient();
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();
      if (sessionError || !sessionData.session) {
        return { ok: false, reason: "session" };
      }

      const { data: planData, error: planError } = await client
        .from("training_plans")
        .select(
          "plan_id,user_id,name,provenance,active_version_id,current_version,session_count,item_count,updated_at,archived_at",
        )
        .is("archived_at", null)
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
        alternativesResult,
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
            "item_id,session_id,version_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,planned_weight_kg,set_progression_kg,duration_seconds,distance_meters,rest_seconds,circuit_group,notes",
          )
          .eq("version_id", activeVersionId)
          .order("item_order"),
        client
          .from("training_plan_item_alternatives")
          .select(
            "alternative_id,plan_item_id,version_id,user_id,alternative_order,exercise_name",
          )
          .eq("version_id", activeVersionId)
          .order("alternative_order"),
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
            "run_id,user_id,plan_id,plan_version_id,planned_session_id,operation_id,started_at,paused_at,paused_duration_seconds,updated_at",
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
        alternativesResult.error ??
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
        (alternativesResult.data ?? []) as TrainingPlanItemAlternativeRow[],
      );
      const runRow = runResult.data as TrainingSessionRunRow | null;
      const lastCompleted =
        completedResult.data as CompletedTrainingSessionRow | null;
      let activeRun = null;

      if (runRow) {
        const [
          runItemsResult,
          runSetsResult,
          referencesResult,
          substitutionsResult,
        ] = await Promise.all([
          client
            .from("training_session_run_items")
            .select(
              "run_id,plan_item_id,user_id,item_order,exercise_name,modality,sets,reps_min,reps_max,planned_weight_kg,set_progression_kg,duration_seconds,distance_meters,rest_seconds,circuit_group,notes,started_at,completed_at",
            )
            .eq("run_id", runRow.run_id)
            .order("item_order"),
          client
            .from("training_session_run_sets")
            .select(
              "set_execution_id,run_id,plan_item_id,user_id,set_number,planned_reps_min,planned_reps_max,actual_reps,planned_weight_kg,actual_weight_kg,planned_duration_seconds,actual_duration_seconds,planned_distance_meters,actual_distance_meters,completed_at,revision,updated_at",
            )
            .eq("run_id", runRow.run_id)
            .order("set_number"),
          client.rpc("get_previous_training_set_references", {
            p_run_id: runRow.run_id,
          }),
          client
            .from("training_session_run_item_substitutions")
            .select(
              "run_id,plan_item_id,user_id,alternative_id,operation_id,reason,planned_exercise_name,executed_exercise_name,substituted_at",
            )
            .eq("run_id", runRow.run_id),
        ]);
        const activeRunError =
          runItemsResult.error ??
          runSetsResult.error ??
          referencesResult.error ??
          substitutionsResult.error;
        if (activeRunError) {
          return failure(activeRunError);
        }
        const planned = sessions.find(
          (session) => session.sessionId === runRow.planned_session_id,
        );
        if (!planned) {
          return { ok: false, reason: "conflict" };
        }
        activeRun = activeTrainingRunSchema.parse({
          pausedAt: runRow.paused_at,
          pausedDurationSeconds: runRow.paused_duration_seconds,
          runId: runRow.run_id,
          session: {
            ...planned,
            items: (runItemsResult.data ?? []).map((item) =>
              mapRunItem(
                item as TrainingSessionRunItemRow,
                (runSetsResult.data ?? []) as TrainingSessionRunSetRow[],
                (referencesResult.data ??
                  []) as PreviousTrainingSetReferenceRpcRow[],
                (alternativesResult.data ??
                  []) as TrainingPlanItemAlternativeRow[],
                (substitutionsResult.data ??
                  []) as TrainingSessionRunSubstitutionRow[],
              ),
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
            activeRun?.session ??
            selectedSession(sessions, now(), preferredSessionId),
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

  const startWithIdentity: ReplayableTrainingSessionGateway["startWithIdentity"] =
    async ({ plannedSessionId, runId, startedAt }) => {
      try {
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("start_training_session_at", {
            p_operation_id: `training-start:${runId}`,
            p_planned_session_id: plannedSessionId,
            p_run_id: runId,
            p_started_at: startedAt,
          }),
        );
        const row = data?.[0] as TrainingStartRpcRow | undefined;
        if (error || !row || row.run_id !== runId) {
          return error ? failure(error) : { ok: false, reason: "conflict" };
        }
        const state = await load();
        if (!state.ok) {
          return state;
        }
        if (!state.value.activeRun || state.value.activeRun.runId !== runId) {
          return { ok: false, reason: "conflict" };
        }
        return { ok: true, value: state.value.activeRun };
      } catch {
        return { ok: false, reason: "configuration" };
      }
    };

  const pauseAt: ReplayableTrainingSessionGateway["pauseAt"] = async (
    runId,
    pausedAt,
  ) => {
    try {
      const client = getClient();
      const { data, error } = await retryIdempotentSupabaseRequest(() =>
        client.rpc("pause_training_session_at", {
          p_paused_at: pausedAt,
          p_run_id: runId,
        }),
      );
      const row = data?.[0] as TrainingPauseRpcRow | undefined;
      if (error || !row) {
        return failure(error);
      }
      return {
        ok: true,
        value: {
          pausedAt: row.paused_at,
          pausedDurationSeconds: row.paused_duration_seconds,
          runId: row.run_id,
          wasChanged: row.was_changed,
        },
      };
    } catch {
      return { ok: false, reason: "configuration" };
    }
  };

  const resumeAt: ReplayableTrainingSessionGateway["resumeAt"] = async (
    runId,
    resumedAt,
  ) => {
    try {
      const client = getClient();
      const { data, error } = await retryIdempotentSupabaseRequest(() =>
        client.rpc("resume_training_session_at", {
          p_resumed_at: resumedAt,
          p_run_id: runId,
        }),
      );
      const row = data?.[0] as TrainingPauseRpcRow | undefined;
      if (error || !row) {
        return failure(error);
      }
      return {
        ok: true,
        value: {
          pausedAt: row.paused_at,
          pausedDurationSeconds: row.paused_duration_seconds,
          runId: row.run_id,
          wasChanged: row.was_changed,
        },
      };
    } catch {
      return { ok: false, reason: "configuration" };
    }
  };

  const cancelOnce: ReplayableTrainingSessionGateway["cancelOnce"] = async (
    runId,
    operationId,
  ) => {
    try {
      const client = getClient();
      const { data, error } = await retryIdempotentSupabaseRequest(() =>
        client.rpc("cancel_training_session_once", {
          p_operation_id: operationId,
          p_run_id: runId,
        }),
      );
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
  };

  const finishAt: ReplayableTrainingSessionGateway["finishAt"] = async (
    runId,
    completedAt,
    completionStatus = "complete",
  ) => {
    try {
      const client = getClient();
      const { data, error } = await retryIdempotentSupabaseRequest(() =>
        client.rpc("finish_training_session_with_status_at", {
          p_completed_at: completedAt,
          p_completion_status: completionStatus,
          p_correlation_id: uuid(),
          p_event_id: uuid(),
          p_operation_id:
            completionStatus === "partial"
              ? `training-finish-partial:${runId}`
              : `training-finish:${runId}`,
          p_run_id: runId,
          p_session_id: runId,
        }),
      );
      const row = data?.[0] as TrainingFinishRpcRow | undefined;
      if (error || !row) {
        return failure(error);
      }
      return {
        ok: true,
        value: completedTrainingSessionSchema.parse({
          completedAt: row.completed_at,
          completedSetCount: row.completed_set_count,
          completionStatus: row.completion_status,
          durationSeconds: row.duration_seconds,
          plannedSetCount: row.planned_set_count,
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
  };

  const substituteExerciseAt: ReplayableTrainingSessionGateway["substituteExerciseAt"] =
    async (input) => {
      try {
        const parsed = exerciseSubstitutionInputSchema.parse({
          alternativeId: input.alternativeId,
          itemId: input.itemId,
          reason: input.reason,
          runId: input.runId,
        });
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("substitute_training_exercise", {
            p_alternative_id: parsed.alternativeId,
            p_operation_id: `training-substitute:${parsed.runId}:${parsed.itemId}`,
            p_plan_item_id: parsed.itemId,
            p_reason: parsed.reason,
            p_run_id: parsed.runId,
            p_substituted_at: input.substitutedAt,
          }),
        );
        const row = data?.[0] as TrainingSubstitutionRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: exerciseSubstitutionResultSchema.parse({
            alternativeId: row.alternative_id,
            exerciseName: row.exercise_name,
            plannedExerciseName: row.planned_exercise_name,
            reason: row.reason,
            substitutedAt: row.substituted_at,
            wasCreated: row.was_created,
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
    cancelOnce,
    load,
    async completeSet(input) {
      try {
        const parsed = setCompletionInputSchema.parse(input);
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("complete_training_set", {
            p_actual_distance_meters: parsed.actualDistanceMeters,
            p_actual_duration_seconds: parsed.actualDurationSeconds,
            p_actual_reps: parsed.actualReps,
            p_actual_weight_kg: parsed.actualWeightKg,
            p_operation_id: `training-set:${parsed.runId}:${parsed.itemId}:${parsed.setNumber}`,
            p_plan_item_id: parsed.itemId,
            p_run_id: parsed.runId,
            p_set_number: parsed.setNumber,
          }),
        );
        const row = data?.[0] as SetCompletionRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: setCompletionSchema.parse({
            completedAt: row.completed_at,
            completedSetCount: row.completed_set_count,
            exerciseCompleted: row.exercise_completed,
            setExecutionId: row.set_execution_id,
            setNumber: row.set_number,
            totalSets: row.total_sets,
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
    cancel: (runId) => cancelOnce(runId, `training-cancel:${runId}`),
    pause: (runId) => pauseAt(runId, now().toISOString()),
    pauseAt,
    resume: (runId) => resumeAt(runId, now().toISOString()),
    resumeAt,
    async reviseSet(input) {
      try {
        const parsed = setRevisionInputSchema.parse(input);
        const client = getClient();
        const actualValues =
          parsed.action === "correct"
            ? parsed
            : {
                actualDistanceMeters: null,
                actualDurationSeconds: null,
                actualReps: null,
                actualWeightKg: null,
              };
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("revise_training_set", {
            p_action: parsed.action,
            p_actual_distance_meters: actualValues.actualDistanceMeters,
            p_actual_duration_seconds: actualValues.actualDurationSeconds,
            p_actual_reps: actualValues.actualReps,
            p_actual_weight_kg: actualValues.actualWeightKg,
            p_expected_revision: parsed.expectedRevision,
            p_operation_id: revisionOperationId(
              parsed.action,
              parsed.setExecutionId,
              parsed.expectedRevision,
              actualValues,
            ),
            p_plan_item_id: parsed.itemId,
            p_run_id: parsed.runId,
            p_set_execution_id: parsed.setExecutionId,
            p_set_number: parsed.setNumber,
          }),
        );
        const row = data?.[0] as SetRevisionRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: setRevisionSchema.parse({
            action: row.action,
            changedAt: row.changed_at,
            completedSetCount: row.completed_set_count,
            exerciseCompleted: row.exercise_completed,
            revision: row.revision,
            setExecutionId: row.set_execution_id,
            setNumber: row.set_number,
            totalSets: row.total_sets,
            wasChanged: row.was_changed,
          }),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },
    start: (plannedSessionId) =>
      startWithIdentity({
        plannedSessionId,
        runId: uuid(),
        startedAt: now().toISOString(),
      }),
    startWithIdentity,

    substituteExercise: (input) =>
      substituteExerciseAt({
        ...input,
        substitutedAt: now().toISOString(),
      }),
    substituteExerciseAt,

    async startExercise(runId, itemId) {
      try {
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("start_training_exercise", {
            p_plan_item_id: itemId,
            p_run_id: runId,
          }),
        );
        const row = data?.[0] as ExerciseStartRpcRow | undefined;
        if (error || !row) {
          return failure(error);
        }
        return {
          ok: true,
          value: exerciseStartSchema.parse({
            nextSetNumber: row.next_set_number,
            startedAt: row.started_at,
            totalSets: row.total_sets,
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

    async completeExercise(runId, itemId) {
      try {
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("complete_training_exercise", {
            p_plan_item_id: itemId,
            p_run_id: runId,
          }),
        );
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

    finish: (runId, completionStatus) =>
      finishAt(runId, now().toISOString(), completionStatus),
    finishAt,
  };
}
