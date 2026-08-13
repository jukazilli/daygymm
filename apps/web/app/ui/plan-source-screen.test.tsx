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

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("PlanSourceScreen", () => {
  it("shows three equal paths without pre-confirming one", async () => {
    render(createElement(PlanSourceScreen, { gateway: createGateway() }));

    expect(
      (
        await screen.findByRole("button", {
          name: /Preciso de um profissional/,
        })
      ).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: /Importar planilha oficial/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Montar meu treino/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Preciso de um profissional/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/sugestão DayGym/i)).toBeNull();
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

  it("does not reopen automatically after a path was already selected", async () => {
    const navigate = vi.fn();
    const gateway = createGateway({
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        },
      }),
    });

    render(createElement(PlanSourceScreen, { gateway, navigate }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/hoje/"));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("allows an explicit path change", async () => {
    window.history.replaceState({}, "", "/escolher-plano/?alterar=1");
    const gateway = createGateway({
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        },
      }),
    });

    render(createElement(PlanSourceScreen, { gateway }));

    expect(
      (
        await screen.findByRole("button", {
          name: /Importar planilha oficial/,
        })
      ).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
