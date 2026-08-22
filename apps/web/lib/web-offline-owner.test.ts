import { describe, expect, it, vi } from "vitest";

import {
  currentWebOwnerId,
  forgetWebOwnerId,
  rememberWebOwnerId,
  type OfflineOwnerStorage,
} from "./web-offline-owner";

const ownerId = "70000000-0000-4000-8000-000000000001";

function memoryStorage(): OfflineOwnerStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("web offline owner", () => {
  it("opens local data offline without trying to refresh an expired token", async () => {
    const storage = memoryStorage();
    const getSession = vi.fn();
    rememberWebOwnerId(ownerId, storage);

    await expect(
      currentWebOwnerId({
        auth: { getSession },
        isOnline: () => false,
        storage,
      }),
    ).resolves.toBe(ownerId);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("remembers the owner from a valid persisted Supabase session", async () => {
    const storage = memoryStorage();
    const auth = {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: ownerId } } },
        error: null,
      }),
    };

    await expect(
      currentWebOwnerId({ auth, isOnline: () => true, storage }),
    ).resolves.toBe(ownerId);
    await expect(
      currentWebOwnerId({
        auth: { getSession: vi.fn() },
        isOnline: () => false,
        storage,
      }),
    ).resolves.toBe(ownerId);
  });

  it("does not reuse a previous owner after an authoritative online logout", async () => {
    const storage = memoryStorage();
    rememberWebOwnerId(ownerId, storage);

    await expect(
      currentWebOwnerId({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: null,
          }),
        },
        isOnline: () => true,
        storage,
      }),
    ).resolves.toBeNull();
    forgetWebOwnerId(storage);
  });
});
