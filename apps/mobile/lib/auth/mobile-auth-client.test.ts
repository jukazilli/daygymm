import { describe, expect, it } from "vitest";
import { processLock } from "@supabase/supabase-js";

import {
  mobileSessionStorageKey,
  SecureSessionStorage,
  type SecureKeyValueDriver,
} from "../security/secure-session-storage";
import { mobileAuthOptions } from "./mobile-auth-options";

const noOpSecureDriver: SecureKeyValueDriver = {
  deleteItem: () => Promise.resolve(),
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
};

describe("mobileAuthOptions", () => {
  it("persists only through the approved secure adapter with PKCE", () => {
    const storage = new SecureSessionStorage(noOpSecureDriver);

    expect(mobileAuthOptions(storage)).toEqual({
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        lock: processLock,
        persistSession: true,
        storage,
        storageKey: mobileSessionStorageKey,
      },
      db: { schema: "api" },
      global: { fetch: expect.any(Function) },
    });
  });
});
