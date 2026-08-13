import { describe, expect, it } from "vitest";

import { registerMobileAuthLifecycle } from "./mobile-auth-lifecycle";

describe("registerMobileAuthLifecycle", () => {
  it("refreshes only while the mobile app is active", () => {
    const calls: string[] = [];
    let listener: ((state: string) => void) | undefined;
    const dispose = registerMobileAuthLifecycle(
      {
        currentState: "background",
        addEventListener: (_event, nextListener) => {
          listener = nextListener;
          return { remove: () => calls.push("remove-listener") };
        },
      },
      {
        startAutoRefresh: () => calls.push("start"),
        stopAutoRefresh: () => calls.push("stop"),
      },
    );

    listener?.("active");
    listener?.("inactive");
    dispose();

    expect(calls).toEqual(["stop", "start", "stop", "remove-listener", "stop"]);
  });
});
