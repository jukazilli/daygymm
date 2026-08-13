import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlanSourceGateway } from "@daygym/contracts";

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

    render(createElement(TrainingHubScreen, { gateway }));

    expect(await screen.findByText("Importar sua planilha")).toBeTruthy();
    expect(screen.getByText("Em construção")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Alterar caminho" })
        .getAttribute("href"),
    ).toBe("/escolher-plano");
  });
});
