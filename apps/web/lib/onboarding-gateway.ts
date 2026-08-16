import {
  onboardingContextSchema,
  type OnboardingContext,
  type OnboardingFailure,
  type OnboardingGateway,
  type OnboardingResult,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import type { OnboardingContextRow } from "./supabase-database";
import { retryIdempotentSupabaseRequest } from "./supabase-resilience";

const emptyContext: OnboardingContext = {
  completedAt: null,
  currentStep: 0,
  equipmentContext: null,
  experience: null,
  goal: null,
  limitationStatus: null,
  sessionMinutes: null,
  weeklyDays: null,
};

function mapRow(value: unknown): OnboardingContext {
  const row = value as OnboardingContextRow;
  return onboardingContextSchema.parse({
    completedAt: row.completed_at,
    currentStep: row.current_step,
    equipmentContext: row.equipment_context,
    experience: row.experience,
    goal: row.goal,
    limitationStatus: row.limitation_status,
    sessionMinutes: row.session_minutes,
    weeklyDays: row.weekly_days,
  });
}

function failureFromError(error: unknown): OnboardingFailure {
  if (error && typeof error === "object") {
    const status = "status" in error ? error.status : undefined;
    const code = "code" in error ? error.code : undefined;
    if (status === 401 || status === 403) {
      return "session";
    }
    if (code === "42501" || code === "PGRST301") {
      return "session";
    }
  }

  return "unexpected";
}

function failure<T>(error: unknown): OnboardingResult<T> {
  return { ok: false, reason: failureFromError(error) };
}

export function createWebOnboardingGateway(): OnboardingGateway {
  return {
    async load() {
      try {
        const client = getWebSupabaseClient();
        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();
        if (sessionError || !sessionData.session) {
          return { ok: false, reason: "session" };
        }

        const { data, error } = await client
          .from("onboarding_contexts")
          .select(
            "goal,experience,weekly_days,session_minutes,equipment_context,limitation_status,current_step,completed_at",
          )
          .limit(1)
          .maybeSingle();

        if (error) {
          return failure(error);
        }

        return { ok: true, value: data ? mapRow(data) : emptyContext };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async save(input) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("save_onboarding_context", {
            p_confirmed: input.confirmed,
            p_current_step: input.currentStep,
            p_equipment_context: input.equipmentContext,
            p_experience: input.experience,
            p_goal: input.goal,
            p_limitation_status: input.limitationStatus,
            p_session_minutes: input.sessionMinutes,
            p_weekly_days: input.weeklyDays,
          }),
        );

        if (error || !data) {
          return failure(error);
        }

        return { ok: true, value: mapRow(data) };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },
  };
}
