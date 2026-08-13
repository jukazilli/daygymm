import { describe, expect, it } from "vitest";

import {
  mobileSessionStorageKey,
  SecureSessionStorage,
  type SecureKeyValueDriver,
} from "./secure-session-storage";

class MemorySecureStore implements SecureKeyValueDriver {
  readonly values = new Map<string, string>();
  failOnSetKey: string | undefined;

  async deleteItem(key: string) {
    this.values.delete(key);
  }

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    if (key === this.failOnSetKey) {
      throw new Error("simulated secure storage failure");
    }
    this.values.set(key, value);
  }
}

describe("SecureSessionStorage", () => {
  it("round-trips a session larger than one native item", async () => {
    const driver = new MemorySecureStore();
    const storage = new SecureSessionStorage(driver);
    const session = JSON.stringify({
      access_token: "a".repeat(900),
      refresh_token: "r".repeat(500),
    });

    await storage.setItem(mobileSessionStorageKey, session);

    expect(await storage.getItem(mobileSessionStorageKey)).toBe(session);
    expect(driver.values.size).toBeGreaterThan(3);
  });

  it("keeps the previous complete session if a replacement fails", async () => {
    const driver = new MemorySecureStore();
    const storage = new SecureSessionStorage(driver);
    await storage.setItem(mobileSessionStorageKey, "previous-session");
    driver.failOnSetKey = `${mobileSessionStorageKey}.b.1`;

    await expect(
      storage.setItem(mobileSessionStorageKey, "n".repeat(500)),
    ).rejects.toThrow("simulated secure storage failure");

    expect(await storage.getItem(mobileSessionStorageKey)).toBe(
      "previous-session",
    );
  });

  it("fails closed when a stored session is incomplete", async () => {
    const driver = new MemorySecureStore();
    const storage = new SecureSessionStorage(driver);
    await storage.setItem(mobileSessionStorageKey, "x".repeat(500));
    driver.values.delete(`${mobileSessionStorageKey}.a.1`);

    expect(await storage.getItem(mobileSessionStorageKey)).toBeNull();
  });

  it("removes every session fragment during logout", async () => {
    const driver = new MemorySecureStore();
    const storage = new SecureSessionStorage(driver);
    await storage.setItem(mobileSessionStorageKey, "x".repeat(900));

    await storage.removeItem(mobileSessionStorageKey);

    expect(await storage.getItem(mobileSessionStorageKey)).toBeNull();
    expect(driver.values.size).toBe(0);
  });

  it("rejects arbitrary storage keys", async () => {
    const storage = new SecureSessionStorage(new MemorySecureStore());

    await expect(storage.getItem("other-key")).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });

  it("keeps PKCE verifier slots inside the same secure namespace", async () => {
    const storage = new SecureSessionStorage(new MemorySecureStore());
    const verifierKey = `${mobileSessionStorageKey}-code-verifier`;

    await storage.setItem(verifierKey, "verifier/recovery");

    expect(await storage.getItem(verifierKey)).toBe("verifier/recovery");
  });

  it("rejects oversized sessions before writing", async () => {
    const driver = new MemorySecureStore();
    const storage = new SecureSessionStorage(driver);

    await expect(
      storage.setItem(mobileSessionStorageKey, "x".repeat(12_801)),
    ).rejects.toMatchObject({
      code: "SESSION_TOO_LARGE",
    });
    expect(driver.values.size).toBe(0);
  });
});
