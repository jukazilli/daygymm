import { describe, expect, it, vi } from "vitest";

import type { PlanSourceState } from "@daygym/contracts";

import type { PlanSourceLocalStore } from "./plan-source-local-store";
import { createWebPlanSourceGateway } from "./plan-source-gateway";

const ownerId = "70000000-0000-4000-8000-000000000001";
const cachedState = {
  onboardingCompleted: true,
  selectedAt: "2026-08-16T12:00:00.000Z",
  source: "manual",
} as const;

function memoryStore(
  initial: PlanSourceState | null = cachedState,
): PlanSourceLocalStore {
  let state: PlanSourceState | null = initial;
  return {
    read: () => state,
    save: (_ownerId, value) => {
      state = value;
    },
  };
}

describe("createWebPlanSourceGateway", () => {
  it("loads the last valid app checkpoint without network", async () => {
    const getClient = vi.fn();
    const gateway = createWebPlanSourceGateway({
      getClient,
      isOnline: () => false,
      ownerId: async () => ownerId,
      store: memoryStore(),
    });

    await expect(gateway.load()).resolves.toEqual({
      ok: true,
      value: cachedState,
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it("falls back to the checkpoint when the remote read is unavailable", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 503 },
    });
    const gateway = createWebPlanSourceGateway({
      getClient: () =>
        ({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              limit: vi.fn(() => ({ maybeSingle })),
            })),
          })),
        }) as never,
      isOnline: () => true,
      ownerId: async () => ownerId,
      store: memoryStore(),
    });

    await expect(gateway.load()).resolves.toEqual({
      ok: true,
      value: cachedState,
    });
  });
});
