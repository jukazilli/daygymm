import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";

import {
  TrainingSessionLocalFirstRuntime,
  createSupabaseTrainingSessionGateway,
  type TrainingConnectivity,
} from "@daygym/training-runtime";

import { createMobileAuthRuntime } from "../auth/mobile-auth-client";
import { mobileTrainingSessionLocalStore } from "./mobile-training-session-local-store";

function mobileConnectivity(): TrainingConnectivity {
  let online = true;

  void NetInfo.fetch()
    .then((state) => {
      online =
        state.isConnected !== false && state.isInternetReachable !== false;
    })
    .catch(() => undefined);

  return {
    isOnline: () => online,
    subscribe(listener) {
      return NetInfo.addEventListener((state) => {
        online =
          state.isConnected !== false && state.isInternetReachable !== false;
        listener(online);
      });
    },
  };
}

let mobileTrainingSessionGateway: TrainingSessionLocalFirstRuntime | undefined;

export function getMobileTrainingSessionGateway() {
  if (mobileTrainingSessionGateway) return mobileTrainingSessionGateway;

  const trainingAuthRuntime = createMobileAuthRuntime();
  const remote = createSupabaseTrainingSessionGateway({
    getClient: () => trainingAuthRuntime.client,
    uuid: randomUUID,
  });
  mobileTrainingSessionGateway = new TrainingSessionLocalFirstRuntime({
    connectivity: mobileConnectivity(),
    ownerId: async () => {
      const { data } = await trainingAuthRuntime.client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    remote,
    store: mobileTrainingSessionLocalStore,
    uuid: randomUUID,
  });
  return mobileTrainingSessionGateway;
}
