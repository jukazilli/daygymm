import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlanSourceGateway, PlanSourceState } from "@daygym/contracts";

import { TodayScreen } from "./today-screen";

function createGateway(state: PlanSourceState): PlanSourceGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: true, value: state }),
    select: vi.fn(),
  };
}

afterEach(cleanup);

describe("TodayScreen", () => {
  it("keeps onboarding as the primary action when context is incomplete", async () => {
    render(
      createElement(TodayScreen, {
        gateway: createGateway({
          onboardingCompleted: false,
          selectedAt: null,
          source: null,
        }),
      }),
    );

    expect(
      await screen.findByText("Prepare seu primeiro treino."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Continuar configuração" })
        .getAttribute("href"),
    ).toBe("/comecar");
  });

  it("opens the training hub when a plan path already exists", async () => {
    render(
      createElement(TodayScreen, {
        gateway: createGateway({
          onboardingCompleted: true,
          selectedAt: "2026-08-13T17:00:00.000Z",
          source: "official_xlsx",
        }),
      }),
    );

    expect(await screen.findByText("Planilha oficial")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir Treinos" }).getAttribute("href"),
    ).toBe("/treinos");
    expect(
      screen.getByRole("link", { name: /GdShop/ }).getAttribute("href"),
    ).toBe("/gdshop");
  });

  it("redirects an unauthenticated visitor without exposing a false home state", async () => {
    const navigate = vi.fn();
    const gateway: PlanSourceGateway = {
      load: vi.fn().mockResolvedValue({ ok: false, reason: "session" }),
      select: vi.fn(),
    };

    render(createElement(TodayScreen, { gateway, navigate }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/entrar/"));
    expect(screen.queryByText("Seu treino começa aqui.")).toBeNull();
  });
});
