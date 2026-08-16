import {
  TrainingSessionLocalFirstRuntime,
  type LocalFirstTrainingSessionDependencies,
  type TrainingConnectivity,
} from "@daygym/training-runtime";

import { createWebTrainingSessionGateway } from "./training-session-gateway";
import { getWebSupabaseClient } from "./supabase-browser";
import { IndexedDbTrainingSessionLocalStore } from "./training-session-local-store";

function browserConnectivity(): TrainingConnectivity {
  return {
    isOnline: () => navigator.onLine,
    subscribe(listener) {
      const online = () => listener(true);
      const offline = () => listener(false);
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    },
  };
}

async function currentOwnerId() {
  const { data } = await getWebSupabaseClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export class WebLocalFirstTrainingSessionGateway extends TrainingSessionLocalFirstRuntime {
  constructor(
    dependencies: Partial<LocalFirstTrainingSessionDependencies> = {},
  ) {
    super({
      connectivity: dependencies.connectivity ?? browserConnectivity(),
      now: dependencies.now,
      ownerId: dependencies.ownerId ?? currentOwnerId,
      random: dependencies.random,
      remote: dependencies.remote ?? createWebTrainingSessionGateway(),
      store: dependencies.store ?? new IndexedDbTrainingSessionLocalStore(),
      uuid: dependencies.uuid ?? (() => crypto.randomUUID()),
    });
  }
}

export function createLocalFirstTrainingSessionGateway() {
  return new WebLocalFirstTrainingSessionGateway();
}
