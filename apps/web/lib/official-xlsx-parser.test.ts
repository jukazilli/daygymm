import { describe, expect, it } from "vitest";

import { defaultImportedPlanName } from "./official-xlsx-parser";

describe("defaultImportedPlanName", () => {
  it("uses a neutral editable title based on the local import date", () => {
    expect(defaultImportedPlanName(new Date(2026, 7, 14))).toBe(
      "Treino - 14/08/2026",
    );
  });
});
