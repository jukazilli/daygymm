import { z } from "zod";

import { getWebSupabaseClient } from "./supabase-browser";

const offlineOwnerKey = "daygym:offline-owner:v1";
const ownerIdSchema = z.string().uuid();

export interface OfflineOwnerStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface SessionProvider {
  getSession(): Promise<{
    data: { session: { user?: { id?: string } } | null };
    error: unknown;
  }>;
}

interface OfflineOwnerDependencies {
  readonly auth?: SessionProvider;
  readonly isOnline?: () => boolean;
  readonly storage?: OfflineOwnerStorage;
}

function browserStorage(): OfflineOwnerStorage {
  return window.localStorage;
}

function storedOwnerId(storage: OfflineOwnerStorage) {
  try {
    const parsed = ownerIdSchema.safeParse(storage.getItem(offlineOwnerKey));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isRetryableSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate.name === "AuthRetryableFetchError" ||
    candidate.status === 0 ||
    (typeof candidate.status === "number" && candidate.status >= 500)
  );
}

export function rememberWebOwnerId(
  ownerId: string,
  storage: OfflineOwnerStorage = browserStorage(),
) {
  const parsed = ownerIdSchema.safeParse(ownerId);
  if (!parsed.success) return;
  try {
    storage.setItem(offlineOwnerKey, parsed.data);
  } catch {
    // Offline access remains best effort when browser storage is unavailable.
  }
}

export function forgetWebOwnerId(
  storage: OfflineOwnerStorage = browserStorage(),
) {
  try {
    storage.removeItem(offlineOwnerKey);
  } catch {
    // Supabase sign-out remains authoritative even if local cleanup fails.
  }
}

export async function currentWebOwnerId(
  dependencies: OfflineOwnerDependencies = {},
) {
  const storage = dependencies.storage ?? browserStorage();
  const isOnline = dependencies.isOnline ?? (() => navigator.onLine);
  const cachedOwnerId = storedOwnerId(storage);

  if (!isOnline() && cachedOwnerId) {
    return cachedOwnerId;
  }

  try {
    const auth = dependencies.auth ?? getWebSupabaseClient().auth;
    const { data, error } = await auth.getSession();
    const sessionOwnerId = ownerIdSchema.safeParse(data.session?.user?.id);
    if (sessionOwnerId.success) {
      rememberWebOwnerId(sessionOwnerId.data, storage);
      return sessionOwnerId.data;
    }

    if ((!isOnline() || isRetryableSessionError(error)) && cachedOwnerId) {
      return cachedOwnerId;
    }

    forgetWebOwnerId(storage);
    return null;
  } catch {
    return cachedOwnerId;
  }
}
