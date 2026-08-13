import { describe, expect, it } from "vitest";

import { dayGymTokens } from "./index.js";

describe("DayGym design tokens", () => {
  it("keeps the approved luminous orange brand color", () => {
    expect(dayGymTokens.color.light.action).toBe("#FF6B00");
  });

  it("keeps a dark-theme contract without enabling the theme", () => {
    expect(dayGymTokens.color.dark.action).toBe("#FF8A3D");
  });

  it("uses a readable dark foreground on luminous orange", () => {
    expect(dayGymTokens.color.light.actionContrast).toBe("#24150B");
  });

  it("uses Nunito without changing the approved type scale", () => {
    expect(dayGymTokens.typography).toMatchObject({
      body: 16,
      family: "Nunito",
      heading: 20,
      label: 14,
    });
  });
});
