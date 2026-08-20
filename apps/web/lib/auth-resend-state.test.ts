import { describe, expect, it } from "vitest";

import {
  clearPendingSignUpResend,
  readPendingSignUpResend,
  savePendingSignUpResend,
} from "./auth-resend-state";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("auth resend state", () => {
  it("restores only the minimal unexpired signup context", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-08-20T12:00:00.000Z");

    savePendingSignUpResend(
      {
        deliveryUncertain: true,
        email: "pessoa@example.com",
        resendAvailableAt: now + 80_000,
      },
      now,
      storage,
    );

    expect(readPendingSignUpResend(now + 20_000, storage)).toEqual({
      deliveryUncertain: true,
      email: "pessoa@example.com",
      resendAvailableAt: now + 80_000,
    });
    expect([...storage.values.values()].join(" ")).not.toMatch(
      /password|senha|token/i,
    );
  });

  it("removes expired, malformed and implausibly long state", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-08-20T12:00:00.000Z");

    savePendingSignUpResend(
      {
        deliveryUncertain: false,
        email: "pessoa@example.com",
        resendAvailableAt: now + 80_000,
      },
      now,
      storage,
    );
    expect(readPendingSignUpResend(now + 80_000, storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    storage.setItem("daygym:sign-up-resend:v1", "invalid-json");
    expect(readPendingSignUpResend(now, storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    storage.setItem(
      "daygym:sign-up-resend:v1",
      JSON.stringify({
        deliveryUncertain: false,
        email: "pessoa@example.com",
        resendAvailableAt: now + 81_000,
      }),
    );
    expect(readPendingSignUpResend(now, storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    savePendingSignUpResend(
      {
        deliveryUncertain: false,
        email: "pessoa@example.com",
        resendAvailableAt: now + 81_000,
      },
      now,
      storage,
    );
    expect(storage.values.size).toBe(0);
  });

  it("degrades safely when browser storage is unavailable", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");

    expect(readPendingSignUpResend(now, null)).toBeNull();
    expect(() =>
      savePendingSignUpResend(
        {
          deliveryUncertain: false,
          email: "pessoa@example.com",
          resendAvailableAt: now + 80_000,
        },
        now,
        null,
      ),
    ).not.toThrow();
    expect(() => clearPendingSignUpResend(null)).not.toThrow();
  });

  it("clears the context explicitly after authentication", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-08-20T12:00:00.000Z");

    savePendingSignUpResend(
      {
        deliveryUncertain: false,
        email: "pessoa@example.com",
        resendAvailableAt: now + 80_000,
      },
      now,
      storage,
    );
    clearPendingSignUpResend(storage);

    expect(readPendingSignUpResend(now, storage)).toBeNull();
  });
});
