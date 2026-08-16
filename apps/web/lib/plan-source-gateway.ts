import {
  planSourceStateSchema,
  type PlanSourceFailure,
  type PlanSourceGateway,
  type PlanSourceResult,
  type PlanSourceState,
} from "@daygym/contracts";

import { getWebSupabaseClient } from "./supabase-browser";
import {
  BrowserPlanSourceLocalStore,
  type PlanSourceLocalStore,
} from "./plan-source-local-store";
import type { OnboardingContextRow } from "./supabase-database";
import { retryIdempotentSupabaseRequest } from "./supabase-resilience";
import { currentWebOwnerId } from "./web-offline-owner";

interface WebPlanSourceDependencies {
  readonly getClient?: typeof getWebSupabaseClient;
  readonly isOnline?: () => boolean;
  readonly ownerId?: () => Promise<string | null>;
  readonly store?: PlanSourceLocalStore;
}

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

export function createWebPlanSourceGateway(
  dependencies: WebPlanSourceDependencies = {},
): PlanSourceGateway {
  const getClient = dependencies.getClient ?? getWebSupabaseClient;
  const isOnline = dependencies.isOnline ?? (() => navigator.onLine);
  const ownerId = dependencies.ownerId ?? currentWebOwnerId;
  const store = dependencies.store ?? new BrowserPlanSourceLocalStore();

  return {
    async load() {
      let cached: PlanSourceState | null = null;
      try {
        const currentOwnerId = await ownerId();
        if (!currentOwnerId) {
          return { ok: false, reason: "session" };
        }
        cached = store.read(currentOwnerId);
        if (!isOnline()) {
          return cached
            ? { ok: true, value: cached }
            : { ok: false, reason: "unexpected" };
        }

        const client = getClient();
        const { data, error } = await client
          .from("onboarding_contexts")
          .select("completed_at,plan_source,plan_source_selected_at")
          .limit(1)
          .maybeSingle();

        if (error) {
          return cached ? { ok: true, value: cached } : failure(error);
        }

        const value: PlanSourceState = data
          ? mapRow(data)
          : {
              onboardingCompleted: false,
              selectedAt: null,
              source: null,
            };
        store.save(currentOwnerId, value);
        return { ok: true, value };
      } catch (error) {
        if (cached) {
          return { ok: true, value: cached };
        }
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },

    async select(source) {
      try {
        const currentOwnerId = await ownerId();
        if (!currentOwnerId) {
          return { ok: false, reason: "session" };
        }
        const client = getClient();
        const { data, error } = await retryIdempotentSupabaseRequest(() =>
          client.rpc("select_plan_source", {
            p_plan_source: source,
          }),
        );

        if (error || !data) {
          return failure(error);
        }

        const value = mapRow(data);
        store.save(currentOwnerId, value);
        return { ok: true, value };
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return failure(error);
        }
        return { ok: false, reason: "configuration" };
      }
    },
  };
}
