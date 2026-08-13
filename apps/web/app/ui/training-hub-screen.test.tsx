import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlanSourceGateway, TrainingPlanGateway } from "@daygym/contracts";

import { TrainingHubScreen } from "./training-hub-screen";

afterEach(cleanup);

describe("TrainingHubScreen", () => {
  it("shows the selected path without pretending its future flow exists", async () => {
    const gateway: PlanSourceGateway = {
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        },
      }),
      select: vi.fn(),
    };
    const trainingPlanGateway: TrainingPlanGateway = {
      importOfficialXlsx: vi.fn(),
      loadActive: vi.fn().mockResolvedValue({ ok: true, value: null }),
    };

    render(createElement(TrainingHubScreen, { gateway, trainingPlanGateway }));

    expect(await screen.findByText("Importe seu primeiro plano.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Importar planilha" })
        .getAttribute("href"),
    ).toBe("/treinos/importar");
    expect(
      screen
        .getByRole("link", { name: "Alterar caminho" })
        .getAttribute("href"),
    ).toBe("/escolher-plano/?alterar=1");
  });
});
