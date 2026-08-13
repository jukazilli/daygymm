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
    };
    Views: Record<string, never>;
    Functions: {
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
