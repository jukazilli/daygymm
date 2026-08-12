import { describe, expect, it } from "vitest";

import { domainModules, isDomainModule } from "./index.js";

describe("domain module boundary", () => {
  it("exposes only the approved modular domains", () => {
    expect(domainModules).toEqual([
      "training",
      "progress",
      "nutrition",
      "professional",
      "community",
      "rewards",
      "commerce",
    ]);
  });

  it("rejects names outside the domain boundary", () => {
    expect(isDomainModule("training")).toBe(true);
    expect(isDomainModule("supabase")).toBe(false);
  });
});
