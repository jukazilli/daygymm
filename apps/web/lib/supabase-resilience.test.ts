import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseFetchWithClockSkewRecovery,
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
    expect(
      isTransientSupabaseError({
        code: "PGRST303",
        message: "JWT issued at future",
        status: 401,
      }),
    ).toBe(true);
    expect(
      isTransientSupabaseError({
        code: "PGRST303",
        message: "JWT expired",
        status: 401,
      }),
    ).toBe(false);
    expect(isTransientSupabaseError({ code: "22023", status: 400 })).toBe(
      false,
    );
  });

  it("replays a request rejected only because its JWT was just issued", async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { code: "PGRST303", message: "JWT issued at future" },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ user_id: "user-1" }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const resilientFetch = createSupabaseFetchWithClockSkewRecovery({
      delaysMs: [250],
      fetch: fetchRequest,
      wait,
    });

    const response = await resilientFetch(
      "https://project.supabase.co/rest/v1/profiles",
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });

  it("does not replay other JWT validation failures", async () => {
    const response = Response.json(
      { code: "PGRST303", message: "JWT expired" },
      { status: 401 },
    );
    const fetchRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    const resilientFetch = createSupabaseFetchWithClockSkewRecovery({
      fetch: fetchRequest,
      wait: vi.fn(),
    });

    await expect(
      resilientFetch("https://project.supabase.co/rest/v1/profiles"),
    ).resolves.toBe(response);
    expect(fetchRequest).toHaveBeenCalledOnce();
  });
});
