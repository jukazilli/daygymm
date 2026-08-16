"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function browserSnapshot() {
  return navigator.onLine;
}

function serverSnapshot() {
  return true;
}

export function ConnectivityStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    browserSnapshot,
    serverSnapshot,
  );

  return isOnline ? null : (
    <span className="offline-badge" role="status">
      Modo offline
    </span>
  );
}
