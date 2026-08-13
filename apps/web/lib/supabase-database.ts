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
  current_version: number;
  item_count: number;
  name: string;
  plan_id: string;
  provenance: "official_xlsx";
  session_count: number;
  updated_at: string;
  user_id: string;
}

interface TrainingPlanVersionRow extends Record<string, unknown> {
  operation_id: string;
  plan_id: string;
  source_file_name: string;
  source_sha256: string;
  source_size_bytes: number;
  user_id: string;
  version_id: string;
  version_number: number;
}

interface TrainingPlanSessionRow extends Record<string, unknown> {
  day_order: number;
  name: string;
  session_id: string;
  user_id: string;
  version_id: string;
}

interface TrainingPlanItemRow extends Record<string, unknown> {
  circuit_group: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  exercise_name: string;
  item_id: string;
  item_order: number;
  modality: string;
  notes: string | null;
  reps_max: number | null;
  reps_min: number | null;
  rest_seconds: number;
  session_id: string;
  sets: number;
  user_id: string;
  version_id: string;
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
      training_plan_sessions: TableDefinition<TrainingPlanSessionRow>;
      training_plan_versions: TableDefinition<TrainingPlanVersionRow>;
      training_plans: TableDefinition<TrainingPlanRow>;
    };
    Views: Record<string, never>;
    Functions: {
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
    };
  };
}
