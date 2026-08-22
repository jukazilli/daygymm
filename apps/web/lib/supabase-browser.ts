import { createClient } from "@supabase/supabase-js";

import { getWebPublicConfig } from "./supabase-public-config";
import { createSupabaseFetchWithClockSkewRecovery } from "./supabase-resilience";
import type { WebDatabase } from "./supabase-database";

function createWebClient(url: string, publishableKey: string) {
  return createClient<WebDatabase, "api">(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
    },
    db: { schema: "api" },
    global: { fetch: createSupabaseFetchWithClockSkewRecovery() },
  });
}

let browserClient: ReturnType<typeof createWebClient> | undefined;

export function getWebSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const config = getWebPublicConfig();
  browserClient = createWebClient(config.url, config.publishableKey);

  return browserClient;
}
