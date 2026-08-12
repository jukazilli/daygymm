import { describe, expect, it } from "vitest";

import { dayGymTokens } from "./index.js";

describe("DayGym design tokens", () => {
  it("keeps the approved light theme action color", () => {
    expect(dayGymTokens.color.light.action).toBe("#C2410C");
  });

  it("keeps a dark-theme contract without enabling the theme", () => {
    expect(dayGymTokens.color.dark.action).toBe("#FB923C");
  });
});
