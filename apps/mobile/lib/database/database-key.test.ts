import { describe, expect, it } from "vitest";

import type { SecureKeyValueDriver } from "../security/secure-session-storage";
import { DatabaseKeyProvider } from "./database-key";

class MemoryKeyStore implements SecureKeyValueDriver {
  readonly values = new Map<string, string>();

  async deleteItem(key: string) {
    this.values.delete(key);
  }

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("DatabaseKeyProvider", () => {
  it("generates and persists one 256-bit lowercase hexadecimal key", async () => {
    const store = new MemoryKeyStore();
    let calls = 0;
    const provider = new DatabaseKeyProvider(store, async (length) => {
      calls += 1;
      return new Uint8Array(length).fill(171);
    });

    const [first, second] = await Promise.all([
      provider.getOrCreate(),
      provider.getOrCreate(),
    ]);

    expect(first).toBe("ab".repeat(32));
    expect(second).toBe(first);
    expect(calls).toBe(1);
    expect([...store.values.values()]).toEqual([first]);
  });

  it("loads an existing key without invoking the random source", async () => {
    const store = new MemoryKeyStore();
    store.values.set("daygym.local.database-key.v1", "12".repeat(32));
    const provider = new DatabaseKeyProvider(store, async () => {
      throw new Error("random source must not be called");
    });

    expect(await provider.getOrCreate()).toBe("12".repeat(32));
  });

  it("blocks an invalid stored key instead of replacing it", async () => {
    const store = new MemoryKeyStore();
    store.values.set("daygym.local.database-key.v1", "corrupted");
    const provider = new DatabaseKeyProvider(store, async () =>
      Promise.resolve(new Uint8Array(32)),
    );

    await expect(provider.getOrCreate()).rejects.toMatchObject({
      code: "INVALID_KEY",
    });
    expect(store.values.get("daygym.local.database-key.v1")).toBe("corrupted");
  });

  it("rejects a random source with the wrong byte count", async () => {
    const provider = new DatabaseKeyProvider(
      new MemoryKeyStore(),
      async () => new Uint8Array(16),
    );

    await expect(provider.getOrCreate()).rejects.toMatchObject({
      code: "RANDOM_SOURCE_FAILED",
    });
  });
});
