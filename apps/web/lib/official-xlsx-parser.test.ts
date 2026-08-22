import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  defaultImportedPlanName,
  isSupportedOfficialTrainingHeader,
  parseOfficialXlsxFile,
} from "./official-xlsx-parser";

describe("defaultImportedPlanName", () => {
  it("uses a neutral editable title based on the local import date", () => {
    expect(defaultImportedPlanName(new Date(2026, 7, 14))).toBe(
      "Treino - 14/08/2026",
    );
  });

  it("keeps legacy second-based template headers compatible", () => {
    expect(
      isSupportedOfficialTrainingHeader([
        "Dia",
        "Sessão",
        "Ordem",
        "Exercício",
        "Tipo",
        "Séries",
        "Reps mín",
        "Reps máx",
        "Duração (s)",
        "Distância (m)",
        "Descanso (s)",
        "Circuito",
        "Observações",
        "Carga (kg)",
      ]),
    ).toBe(true);
  });

  it("imports the optional planned load without changing time exercises", async () => {
    const template = readFileSync(
      resolve("public/templates/daygym-modelo-oficial-treino.xlsx"),
    );
    const file = new File([Uint8Array.from(template)], "treino.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const digest = vi
      .spyOn(crypto.subtle, "digest")
      .mockResolvedValue(new Uint8Array(32).buffer);

    const result = await parseOfficialXlsxFile(file).finally(() =>
      digest.mockRestore(),
    );

    expect(result.issues).toEqual([]);
    expect(result.proposal?.sessions[0]?.items[0]?.plannedWeightKg).toBe(40);
    expect(result.proposal?.sessions[0]?.items[1]).toMatchObject({
      durationSeconds: 30,
      plannedWeightKg: null,
      repsMax: null,
      repsMin: null,
    });
  });
});
