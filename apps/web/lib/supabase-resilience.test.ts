import { describe, expect, it, vi } from "vitest";

import {
  isTransientSupabaseError,
  retryIdempotentSupabaseRequest,
} from "./supabase-resilience";

describe("Supabase request resilience", () => {
  it("retries a transient response and preserves the successful result", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { status: 503 } })
      .mockResolvedValueOnce({ data: { wasCreated: false }, error: null });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryIdempotentSupabaseRequest(request, {
        delaysMs: [10],
        wait,
      }),
    ).resolves.toEqual({ data: { wasCreated: false }, error: null });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10);
  });

  it("does not retry a semantic validation failure", async () => {
    const failure = { code: "23514", status: 400 };
    const request = vi.fn().mockResolvedValue({ data: null, error: failure });

    await expect(
      retryIdempotentSupabaseRequest(request, {
        delaysMs: [10, 20],
        wait: vi.fn(),
      }),
    ).resolves.toEqual({ data: null, error: failure });
    expect(request).toHaveBeenCalledOnce();
  });

  it("classifies transport and service availability failures", () => {
    expect(isTransientSupabaseError(new TypeError("Failed to fetch"))).toBe(
      true,
    );
    expect(isTransientSupabaseError({ code: "PGRST001" })).toBe(true);
    expect(isTransientSupabaseError({ status: 429 })).toBe(true);
    expect(isTransientSupabaseError({ code: "22023", status: 400 })).toBe(
      false,
    );
  });
});
