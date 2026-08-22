import { processLock } from "@supabase/supabase-js";
import { createSupabaseFetchWithClockSkewRecovery } from "@daygym/training-runtime";

import {
  mobileSessionStorageKey,
  type SecureSessionStorage,
} from "../security/secure-session-storage";

export function mobileAuthOptions(storage: SecureSessionStorage) {
  return {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce" as const,
      lock: processLock,
      persistSession: true,
      storage,
      storageKey: mobileSessionStorageKey,
    },
    db: { schema: "api" as const },
    global: { fetch: createSupabaseFetchWithClockSkewRecovery() },
  };
}
