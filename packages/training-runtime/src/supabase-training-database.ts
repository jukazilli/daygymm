export interface TrainingPlanRow extends Record<string, unknown> {
  active_version_id: string | null;
  archived_at: string | null;
  current_version: number;
  item_count: number;
  name: string;
  plan_id: string;
  provenance: "manual" | "official_xlsx";
  session_count: number;
  updated_at: string;
  user_id: string;
}

export interface TrainingPlanSessionRow extends Record<string, unknown> {
  day_order: number;
  name: string;
  session_id: string;
  user_id: string;
  version_id: string;
}

export interface TrainingPlanScheduleEntryRow extends Record<string, unknown> {
  planned_session_id: string;
  schedule_entry_id: string;
  slot_order: number;
  user_id: string;
  version_id: string;
  weekday: number;
}

export interface TrainingPlanItemRow extends Record<string, unknown> {
  circuit_group: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  exercise_name: string;
  item_id: string;
  item_order: number;
  modality: string;
  notes: string | null;
  planned_weight_kg: number | null;
  reps_max: number | null;
  reps_min: number | null;
  rest_seconds: number;
  session_id: string;
  set_progression_kg: number | null;
  sets: number;
  user_id: string;
  version_id: string;
}

export interface TrainingPlanItemAlternativeRow extends Record<
  string,
  unknown
> {
  alternative_id: string;
  alternative_order: number;
  exercise_name: string;
  plan_item_id: string;
  user_id: string;
  version_id: string;
}

export interface TrainingSessionRunSubstitutionRow extends Record<
  string,
  unknown
> {
  alternative_id: string;
  executed_exercise_name: string;
  operation_id: string;
  plan_item_id: string;
  planned_exercise_name: string;
  reason: "comfort" | "equipment_unavailable" | "other" | "preference";
  run_id: string;
  substituted_at: string;
  user_id: string;
}

export interface TrainingSessionRunRow extends Record<string, unknown> {
  operation_id: string;
  paused_at: string | null;
  paused_duration_seconds: number;
  plan_id: string;
  plan_version_id: string;
  planned_session_id: string;
  run_id: string;
  started_at: string;
  updated_at: string;
  user_id: string;
}

export interface TrainingSessionRunItemRow extends Record<string, unknown> {
  circuit_group: string | null;
  completed_at: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  exercise_name: string;
  item_order: number;
  modality: string;
  notes: string | null;
  plan_item_id: string;
  planned_weight_kg: number | null;
  reps_max: number | null;
  reps_min: number | null;
  rest_seconds: number;
  run_id: string;
  set_progression_kg: number | null;
  sets: number;
  started_at: string | null;
  user_id: string;
}

export interface TrainingSessionRunSetRow extends Record<string, unknown> {
  actual_distance_meters: number | null;
  actual_duration_seconds: number | null;
  actual_reps: number | null;
  actual_weight_kg: number | null;
  completed_at: string;
  plan_item_id: string;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  planned_reps_max: number | null;
  planned_reps_min: number | null;
  planned_weight_kg: number | null;
  revision: number;
  run_id: string;
  set_execution_id: string;
  set_number: number;
  updated_at: string;
  user_id: string;
}

export interface PreviousTrainingSetReferenceRpcRow extends Record<
  string,
  unknown
> {
  actual_distance_meters: number | null;
  actual_duration_seconds: number | null;
  actual_reps: number | null;
  actual_weight_kg: number | null;
  completed_at: string;
  plan_item_id: string;
  set_number: number;
  source_session_id: string;
}

export interface CompletedTrainingSessionRow extends Record<string, unknown> {
  completed_at: string;
  completed_exercise_count: number | null;
  duration_seconds: number | null;
  exercise_count: number | null;
  plan_id: string | null;
  plan_version_id: string | null;
  planned_session_id: string | null;
  session_id: string;
  started_at: string | null;
  user_id: string;
}

export interface TrainingStartRpcRow extends Record<string, unknown> {
  planned_session_id: string;
  run_id: string;
  started_at: string;
  was_created: boolean;
}

export interface ExerciseCompletionRpcRow extends Record<string, unknown> {
  completed_count: number;
  total_count: number;
  was_created: boolean;
}

export interface ExerciseStartRpcRow extends Record<string, unknown> {
  next_set_number: number;
  started_at: string;
  total_sets: number;
  was_created: boolean;
}

export interface SetCompletionRpcRow extends Record<string, unknown> {
  completed_at: string;
  completed_set_count: number;
  exercise_completed: boolean;
  set_execution_id: string;
  set_number: number;
  total_sets: number;
  was_created: boolean;
}

export interface SetRevisionRpcRow extends Record<string, unknown> {
  action: "correct" | "undo";
  changed_at: string;
  completed_set_count: number;
  exercise_completed: boolean;
  revision: number | null;
  set_execution_id: string;
  set_number: number;
  total_sets: number;
  was_changed: boolean;
}

export interface TrainingFinishRpcRow extends Record<string, unknown> {
  completed_at: string;
  completed_set_count: number;
  completion_status: "complete" | "partial";
  duration_seconds: number;
  planned_set_count: number;
  session_id: string;
  was_created: boolean;
}

export interface TrainingCancelRpcRow extends Record<string, unknown> {
  run_id: string;
  was_cancelled: boolean;
}

export interface TrainingPauseRpcRow extends Record<string, unknown> {
  paused_at: string | null;
  paused_duration_seconds: number;
  run_id: string;
  was_changed: boolean;
}

export interface TrainingSubstitutionRpcRow extends Record<string, unknown> {
  alternative_id: string;
  exercise_name: string;
  planned_exercise_name: string;
  reason: "comfort" | "equipment_unavailable" | "other" | "preference";
  substituted_at: string;
  was_created: boolean;
}
