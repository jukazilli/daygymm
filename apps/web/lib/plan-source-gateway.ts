import {
  planSourceStateSchema,
  type PlanSourceFailure,
  type PlanSourceGateway,
  type PlanSourceResult,
  type PlanSourceState,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import type { OnboardingContextRow } from "./supabase-database";
import { retryIdempotentSupabaseRequest } from "./supabase-resilience";

function mapRow(value: unknown): PlanSourceState {
  const row = value as OnboardingContextRow;
  return planSourceStateSchema.parse({
    onboardingCompleted: row.completed_at !== null,
    selectedAt: row.plan_source_selected_at,
    source: row.plan_source,
  });
}

function failureFromError(error: unknown): PlanSourceFailure {
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
  }

  return "unexpected";
}

function failure<T>(error: unknown): PlanSourceResult<T> {
  return { ok: false, reason: failureFromError(error) };
}

export function createWebPlanSourceGateway(): PlanSourceGateway {
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
          .select("completed_at,plan_source,plan_source_selected_at")
          .limit(1)
          .maybeSingle();

        if (error) {
          return failure(error);
        }

        return {
          ok: true,
          value: data
            ? mapRow(data)
            : {
                onboardingCompleted: false,
                selectedAt: null,
                source: null,
              },
        };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async select(source) {
      try {
        const client = getWebSupabaseClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("select_plan_source", {
            p_plan_source: source,
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
