import { createSupabaseTrainingSessionGateway } from "@daygym/training-runtime";

import { getWebSupabaseClient } from "./supabase-browser";

export function createWebTrainingSessionGateway() {
  return createSupabaseTrainingSessionGateway({
    getClient: getWebSupabaseClient,
  });
}
