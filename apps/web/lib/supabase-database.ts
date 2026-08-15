interface ProfileRow extends Record<string, unknown> {
  user_id: string;
}

interface ConsentRow extends Record<string, unknown> {
  document: string;
  document_version: string;
}

export interface OnboardingContextRow extends Record<string, unknown> {
  completed_at: string | null;
  current_step: number;
  equipment_context: string | null;
  experience: string | null;
  goal: string | null;
  limitation_status: string | null;
  plan_source: string | null;
  plan_source_selected_at: string | null;
  session_minutes: number | null;
  updated_at: string;
  user_id: string;
  weekly_days: number | null;
}

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

export interface TrainingPlanVersionRow extends Record<string, unknown> {
  author_user_id: string;
  change_summary: string;
  content_sha256: string | null;
  operation_id: string;
  origin: "manual" | "official_xlsx";
  plan_id: string;
  source_file_name: string | null;
  source_sha256: string | null;
  source_size_bytes: number | null;
  user_id: string;
  version_id: string;
  version_number: number;
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
  load_increment_kg: number | null;
  load_mode: "external" | "none" | "unconfigured";
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
  run_id: string;
  revision: number;
  set_execution_id: string;
  set_number: number;
  updated_at: string;
  user_id: string;
}

export interface TrainingSessionSetRow extends Record<string, unknown> {
  actual_distance_meters: number | null;
  actual_duration_seconds: number | null;
  actual_reps: number | null;
  actual_weight_kg: number | null;
  completed_at: string;
  exercise_name: string;
  exercise_order: number;
  plan_item_id: string;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  planned_reps_max: number | null;
  planned_reps_min: number | null;
  planned_weight_kg: number | null;
  revision: number;
  session_id: string;
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
  duration_seconds: number;
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

export interface TrainingPlanImportRpcRow extends Record<string, unknown> {
  item_count: number;
  plan_id: string;
  plan_name: string;
  plan_version: number;
  session_count: number;
  version_id: string;
  was_created: boolean;
}

export interface TrainingPlanRenameRpcRow extends Record<string, unknown> {
  plan_id: string;
  plan_name: string;
  updated_at: string;
}

export interface TrainingPlanArchiveRpcRow extends Record<string, unknown> {
  archived_at: string;
  plan_id: string;
  was_changed: boolean;
}

export interface TrainingPlanRestoreRpcRow extends Record<string, unknown> {
  plan_id: string;
  was_changed: boolean;
}

type TableDefinition<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface WebDatabase {
  api: {
    Tables: {
      consents: TableDefinition<ConsentRow>;
      onboarding_contexts: TableDefinition<OnboardingContextRow>;
      profiles: TableDefinition<ProfileRow>;
      training_plan_items: TableDefinition<TrainingPlanItemRow>;
      training_plan_schedule_entries: TableDefinition<TrainingPlanScheduleEntryRow>;
      training_plan_sessions: TableDefinition<TrainingPlanSessionRow>;
      training_plan_versions: TableDefinition<TrainingPlanVersionRow>;
      training_plans: TableDefinition<TrainingPlanRow>;
      training_session_run_items: TableDefinition<TrainingSessionRunItemRow>;
      training_session_run_sets: TableDefinition<TrainingSessionRunSetRow>;
      training_session_runs: TableDefinition<TrainingSessionRunRow>;
      training_session_sets: TableDefinition<TrainingSessionSetRow>;
      training_sessions: TableDefinition<CompletedTrainingSessionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      archive_training_plan: {
        Args: {
          p_plan_id: string;
        };
        Returns: TrainingPlanArchiveRpcRow[];
      };
      cancel_training_session: {
        Args: {
          p_run_id: string;
        };
        Returns: TrainingCancelRpcRow[];
      };
      import_official_xlsx_plan: {
        Args: {
          p_operation_id: string;
          p_plan_name: string;
          p_sessions: unknown;
          p_source_file_name: string;
          p_source_sha256: string;
          p_source_size_bytes: number;
        };
        Returns: TrainingPlanImportRpcRow[];
      };
      pause_training_session: {
        Args: {
          p_run_id: string;
        };
        Returns: TrainingPauseRpcRow[];
      };
      publish_training_plan_version: {
        Args: {
          p_change_summary: string;
          p_content_sha256: string;
          p_operation_id: string;
          p_plan_id: string | null;
          p_plan_name: string;
          p_sessions: unknown;
        };
        Returns: TrainingPlanImportRpcRow[];
      };
      publish_training_plan_version_v2: {
        Args: {
          p_change_summary: string;
          p_content_sha256: string;
          p_operation_id: string;
          p_plan_id: string | null;
          p_plan_name: string;
          p_sessions: unknown;
        };
        Returns: TrainingPlanImportRpcRow[];
      };
      import_official_xlsx_plan_v2: {
        Args: {
          p_operation_id: string;
          p_plan_name: string;
          p_sessions: unknown;
          p_source_file_name: string;
          p_source_sha256: string;
          p_source_size_bytes: number;
        };
        Returns: TrainingPlanImportRpcRow[];
      };
      rename_training_plan: {
        Args: {
          p_name: string;
          p_plan_id: string;
        };
        Returns: TrainingPlanRenameRpcRow[];
      };
      resume_training_session: {
        Args: {
          p_run_id: string;
        };
        Returns: TrainingPauseRpcRow[];
      };
      restore_training_plan: {
        Args: {
          p_plan_id: string;
        };
        Returns: TrainingPlanRestoreRpcRow[];
      };
      complete_training_exercise: {
        Args: {
          p_plan_item_id: string;
          p_run_id: string;
        };
        Returns: ExerciseCompletionRpcRow[];
      };
      complete_training_set: {
        Args: {
          p_actual_distance_meters: number | null;
          p_actual_duration_seconds: number | null;
          p_actual_reps: number | null;
          p_actual_weight_kg: number | null;
          p_operation_id: string;
          p_plan_item_id: string;
          p_run_id: string;
          p_set_number: number;
        };
        Returns: SetCompletionRpcRow[];
      };
      get_previous_training_set_references: {
        Args: {
          p_run_id: string;
        };
        Returns: PreviousTrainingSetReferenceRpcRow[];
      };
      revise_training_set: {
        Args: {
          p_action: "correct" | "undo";
          p_actual_distance_meters: number | null;
          p_actual_duration_seconds: number | null;
          p_actual_reps: number | null;
          p_actual_weight_kg: number | null;
          p_expected_revision: number;
          p_operation_id: string;
          p_plan_item_id: string;
          p_run_id: string;
          p_set_execution_id: string;
          p_set_number: number;
        };
        Returns: SetRevisionRpcRow[];
      };
      finish_training_session: {
        Args: {
          p_correlation_id: string;
          p_event_id: string;
          p_operation_id: string;
          p_run_id: string;
          p_session_id: string;
        };
        Returns: TrainingFinishRpcRow[];
      };
      select_plan_source: {
        Args: {
          p_plan_source: string;
        };
        Returns: OnboardingContextRow;
      };
      save_onboarding_context: {
        Args: {
          p_confirmed: boolean;
          p_current_step: number;
          p_equipment_context: string | null;
          p_experience: string | null;
          p_goal: string | null;
          p_limitation_status: string | null;
          p_session_minutes: number | null;
          p_weekly_days: number | null;
        };
        Returns: OnboardingContextRow;
      };
      start_training_session: {
        Args: {
          p_operation_id: string;
          p_planned_session_id: string;
          p_run_id: string;
        };
        Returns: TrainingStartRpcRow[];
      };
      start_training_exercise: {
        Args: {
          p_plan_item_id: string;
          p_run_id: string;
        };
        Returns: ExerciseStartRpcRow[];
      };
    };
  };
}
