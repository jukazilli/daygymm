import {
  TrainingSessionLocalFirstRuntime,
  type LocalFirstTrainingSessionDependencies,
  type TrainingConnectivity,
} from "@daygym/training-runtime";

import { createWebTrainingSessionGateway } from "./training-session-gateway";
import { IndexedDbTrainingSessionLocalStore } from "./training-session-local-store";
import { currentWebOwnerId } from "./web-offline-owner";

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

export class WebLocalFirstTrainingSessionGateway extends TrainingSessionLocalFirstRuntime {
  constructor(
    dependencies: Partial<LocalFirstTrainingSessionDependencies> = {},
  ) {
    super({
      connectivity: dependencies.connectivity ?? browserConnectivity(),
      now: dependencies.now,
      ownerId: dependencies.ownerId ?? currentWebOwnerId,
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
