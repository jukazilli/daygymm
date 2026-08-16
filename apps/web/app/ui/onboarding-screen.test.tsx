import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OnboardingGateway,
  PlanSourceGateway,
  TrainingSessionGateway,
} from "@daygym/contracts";

import { OnboardingScreen } from "./onboarding-screen";

const originalOnline = navigator.onLine;

function unavailableOnboarding(): OnboardingGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: false, reason: "unexpected" }),
    save: vi.fn(),
  };
}

function sourceGateway(
  result: Awaited<ReturnType<PlanSourceGateway["load"]>>,
): PlanSourceGateway {
  return { load: vi.fn().mockResolvedValue(result), select: vi.fn() };
}

function trainingGateway(
  result: Awaited<ReturnType<TrainingSessionGateway["load"]>>,
): TrainingSessionGateway {
  return {
    cancel: vi.fn(),
    completeExercise: vi.fn(),
    completeSet: vi.fn(),
    finish: vi.fn(),
    load: vi.fn().mockResolvedValue(result),
    pause: vi.fn(),
    resume: vi.fn(),
    reviseSet: vi.fn(),
    start: vi.fn(),
    startExercise: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: originalOnline,
  });
});

describe("OnboardingScreen offline bootstrap", () => {
  it("leaves a stale onboarding route when the local checkpoint is complete", async () => {
    const navigate = vi.fn();
    render(
      createElement(OnboardingScreen, {
        gateway: unavailableOnboarding(),
        navigate,
        sourceGateway: sourceGateway({
          ok: true,
          value: {
            onboardingCompleted: true,
            selectedAt: "2026-08-16T12:00:00.000Z",
            source: "manual",
          },
        }),
        trainingGateway: trainingGateway({
          ok: false,
          reason: "unexpected",
        }),
      }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/hoje/"));
    expect(
      screen.queryByText(/Não foi possível abrir a configuração/),
    ).toBeNull();
  });

  it("uses the saved training plan to recover users from older app versions", async () => {
    const navigate = vi.fn();
    render(
      createElement(OnboardingScreen, {
        gateway: unavailableOnboarding(),
        navigate,
        sourceGateway: sourceGateway({
          ok: false,
          reason: "unexpected",
        }),
        trainingGateway: trainingGateway({
          ok: true,
          value: {
            activeRun: null,
            lastCompletedAt: null,
            nextSession: null,
            plan: {
              itemCount: 1,
              name: "Plano salvo",
              planId: "70000000-0000-4000-8000-000000000002",
              sessionCount: 1,
              version: 1,
              versionId: "70000000-0000-4000-8000-000000000003",
              wasCreated: false,
            },
            sessions: [],
          },
        }),
      }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/hoje/"));
  });

  it("states that connectivity is required only for unfinished setup", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    render(
      createElement(OnboardingScreen, {
        gateway: unavailableOnboarding(),
        sourceGateway: sourceGateway({
          ok: false,
          reason: "unexpected",
        }),
        trainingGateway: trainingGateway({
          ok: false,
          reason: "unexpected",
        }),
      }),
    );

    expect(
      await screen.findByText(
        "Você está sem internet. Conecte-se para continuar.",
      ),
    ).toBeTruthy();
  });
});
