import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlanSourceGateway } from "@daygym/contracts";

import { PlanSourceScreen } from "./plan-source-screen";

function createGateway(
  overrides: Partial<PlanSourceGateway> = {},
): PlanSourceGateway {
  return {
    load: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        onboardingCompleted: true,
        selectedAt: null,
        source: null,
      },
    }),
    select: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        onboardingCompleted: true,
        selectedAt: "2026-08-13T17:00:00.000Z",
        source: "manual",
      },
    }),
    ...overrides,
  };
}

afterEach(cleanup);

describe("PlanSourceScreen", () => {
  it("shows four equal paths without pre-confirming one", async () => {
    render(createElement(PlanSourceScreen, { gateway: createGateway() }));

    expect(
      (
        await screen.findByRole("button", { name: /Usar sugestão DayGym/ })
      ).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: /Importar planilha oficial/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Montar meu treino/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Receber de profissional/ }),
    ).toBeTruthy();
  });

  it("persists the selected path and exposes the saved state", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();
    render(createElement(PlanSourceScreen, { gateway }));

    await user.click(
      await screen.findByRole("button", { name: /Montar meu treino/ }),
    );

    expect(gateway.select).toHaveBeenCalledWith("manual");
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Montar meu treino/ })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(screen.getByRole("status").textContent).toBe("Escolha salva.");
  });
});
