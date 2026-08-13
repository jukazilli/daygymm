import * as SecureStore from "expo-secure-store";

import type { SecureKeyValueDriver } from "./secure-session-storage";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "daygym.mobile.secure-store.v1",
  requireAuthentication: false,
};

export const expoSecureStoreDriver: SecureKeyValueDriver = {
  deleteItem(key) {
    return SecureStore.deleteItemAsync(key, secureStoreOptions);
  },
  getItem(key) {
    return SecureStore.getItemAsync(key, secureStoreOptions);
  },
  setItem(key, value) {
    return SecureStore.setItemAsync(key, value, secureStoreOptions);
  },
};

export async function assertSecureStoreAvailable(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error("Secure device storage is unavailable.");
  }
}
