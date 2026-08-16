import { planSourceStateSchema, type PlanSourceState } from "@daygym/contracts";

import type { OfflineOwnerStorage } from "./web-offline-owner";

const planSourceKeyPrefix = "daygym:plan-source:v1";

export interface PlanSourceLocalStore {
  read(ownerId: string): PlanSourceState | null;
  save(ownerId: string, state: PlanSourceState): void;
}

function stateKey(ownerId: string) {
  return `${planSourceKeyPrefix}:${ownerId}`;
}

export class BrowserPlanSourceLocalStore implements PlanSourceLocalStore {
  constructor(
    private readonly storage: OfflineOwnerStorage = window.localStorage,
  ) {}

  read(ownerId: string) {
    try {
      const value = this.storage.getItem(stateKey(ownerId));
      if (!value) return null;
      const parsed = planSourceStateSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  save(ownerId: string, state: PlanSourceState) {
    try {
      this.storage.setItem(
        stateKey(ownerId),
        JSON.stringify(planSourceStateSchema.parse(state)),
      );
    } catch {
      // The remote result remains usable when browser storage is unavailable.
    }
  }
}
