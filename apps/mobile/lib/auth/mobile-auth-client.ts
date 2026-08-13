import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { getMobileSupabasePublicConfig } from "../supabase-public-config";
import { expoSecureStoreDriver } from "../security/expo-secure-store-driver";
import { SecureSessionStorage } from "../security/secure-session-storage";
import { mobileAuthOptions } from "./mobile-auth-options";
import { registerMobileAuthLifecycle } from "./mobile-auth-lifecycle";

export function createMobileAuthClient() {
  const config = getMobileSupabasePublicConfig();
  const storage = new SecureSessionStorage(expoSecureStoreDriver);

  return createClient(
    config.url,
    config.publishableKey,
    mobileAuthOptions(storage),
  );
}

export function createMobileAuthRuntime() {
  const client = createMobileAuthClient();
  const unregisterLifecycle = registerMobileAuthLifecycle(
    AppState,
    client.auth,
  );

  return {
    client,
    async dispose() {
      unregisterLifecycle();
      await client.auth.dispose();
    },
  };
}
