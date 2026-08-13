export interface AuthRefreshController {
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

export interface MobileAppStatePort {
  readonly currentState: string;
  addEventListener(
    event: "change",
    listener: (state: string) => void,
  ): { remove(): void };
}

export function registerMobileAuthLifecycle(
  appState: MobileAppStatePort,
  auth: AuthRefreshController,
) {
  const applyState = (state: string) => {
    if (state === "active") {
      auth.startAutoRefresh();
    } else {
      auth.stopAutoRefresh();
    }
  };

  applyState(appState.currentState);
  const subscription = appState.addEventListener("change", applyState);

  return () => {
    subscription.remove();
    auth.stopAutoRefresh();
  };
}
