import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseFetchWithClockSkewRecovery,
  isTransientSupabaseError,
} from "./supabase-resilience";

describe("Supabase clock skew recovery", () => {
  it("retries only the transient freshly-issued JWT rejection", async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { code: "PGRST303", message: "JWT issued at future" },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const resilientFetch = createSupabaseFetchWithClockSkewRecovery({
      delaysMs: [250],
      fetch: fetchRequest,
      wait,
    });

    await expect(
      resilientFetch("https://project.supabase.co/rest/v1/profiles"),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });

  it("does not classify an unrelated invalid JWT as transient", () => {
    expect(
      isTransientSupabaseError({
        code: "PGRST303",
        message: "JWT expired",
        status: 401,
      }),
    ).toBe(false);
  });
});
