import { describe, expect, it } from "vitest";

import {
  formatTrainingDuration,
  isTrainingDurationWithinRange,
  parseTrainingDuration,
  parseTrainingDurationCell,
} from "./training-duration";

describe("training duration", () => {
  it("formats canonical seconds as HH:MM:SS", () => {
    expect(formatTrainingDuration(1_800)).toBe("00:30:00");
    expect(formatTrainingDuration(3_661)).toBe("01:01:01");
  });

  it("accepts HH:MM:SS, MM:SS and legacy seconds", () => {
    expect(parseTrainingDuration("01:30:00")).toBe(5_400);
    expect(parseTrainingDuration("30:00")).toBe(1_800);
    expect(parseTrainingDuration("1800")).toBe(1_800);
  });

  it("rejects malformed or out-of-range durations", () => {
    expect(parseTrainingDuration("00:60:00")).toBeNull();
    expect(parseTrainingDuration("tempo")).toBeNull();
    expect(isTrainingDurationWithinRange("02:00:01", 1, 7_200)).toBe(false);
  });

  it("accepts human text, legacy seconds and Excel time fractions", () => {
    expect(parseTrainingDurationCell("00:30:00")).toBe(1_800);
    expect(parseTrainingDurationCell(1_800)).toBe(1_800);
    expect(parseTrainingDurationCell(1 / 48)).toBe(1_800);
  });
});
