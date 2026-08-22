import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PlanSourceGateway,
  PlanSourceState,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { TodayScreen } from "./today-screen";

function createGateway(state: PlanSourceState): PlanSourceGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: true, value: state }),
    select: vi.fn(),
  };
}

function createTrainingGateway(): TrainingSessionGateway {
  return {
    cancel: vi.fn(),
    completeSet: vi.fn(),
    completeExercise: vi.fn(),
    finish: vi.fn(),
    load: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        activeRun: null,
        lastCompletedAt: null,
        nextSession: null,
        plan: null,
        sessions: [],
      },
    }),
    pause: vi.fn(),
    reviseSet: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
    startExercise: vi.fn(),
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
        trainingGateway: createTrainingGateway(),
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
        trainingGateway: createTrainingGateway(),
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

    render(
      createElement(TodayScreen, {
        gateway,
        navigate,
        trainingGateway: createTrainingGateway(),
      }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/entrar/"));
    expect(screen.queryByText("Seu treino começa aqui.")).toBeNull();
  });

  it("opens the saved workout from a cold offline start when source metadata is unavailable", async () => {
    const gateway: PlanSourceGateway = {
      load: vi.fn().mockResolvedValue({ ok: false, reason: "unexpected" }),
      select: vi.fn(),
    };
    const trainingGateway = createTrainingGateway();
    vi.mocked(trainingGateway.load).mockResolvedValue({
      ok: true,
      value: {
        activeRun: null,
        lastCompletedAt: null,
        nextSession: {
          dayOrder: 1,
          items: [],
          name: "Treino offline",
          sessionId: "65000000-0000-4000-8000-000000000005",
          weekday: 1,
        },
        plan: {
          itemCount: 0,
          name: "Plano local",
          planId: "66000000-0000-4000-8000-000000000006",
          sessionCount: 1,
          version: 1,
          versionId: "67000000-0000-4000-8000-000000000007",
          wasCreated: false,
        },
        sessions: [],
      },
    });

    render(createElement(TodayScreen, { gateway, trainingGateway }));

    expect(await screen.findByText("Treino offline")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir treino" }).getAttribute("href"),
    ).toContain("/treinos/sessao");
    expect(screen.queryByText("Não foi possível carregar.")).toBeNull();
  });
});
