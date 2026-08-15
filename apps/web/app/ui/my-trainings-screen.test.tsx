import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrainingSessionGateway } from "@daygym/contracts";

import { MyTrainingsScreen } from "./my-trainings-screen";

afterEach(cleanup);

describe("MyTrainingsScreen", () => {
  it("lists the weekly plan and lets the user choose a session", async () => {
    const session = {
      dayOrder: 1,
      items: [],
      name: "Peito e tríceps",
      sessionId: "62000000-0000-4000-8000-000000000002",
      weekday: 1,
    };
    const gateway: TrainingSessionGateway = {
      cancel: vi.fn(),
      completeSet: vi.fn(),
      completeExercise: vi.fn(),
      finish: vi.fn(),
      load: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          activeRun: null,
          lastCompletedAt: null,
          nextSession: session,
          plan: {
            itemCount: 0,
            name: "Plano semanal",
            planId: "63000000-0000-4000-8000-000000000003",
            sessionCount: 1,
            version: 1,
            versionId: "64000000-0000-4000-8000-000000000004",
            wasCreated: false,
          },
          sessions: [session],
        },
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
      startExercise: vi.fn(),
    };

    render(createElement(MyTrainingsScreen, { gateway }));

    expect(
      await screen.findByRole("heading", { name: "Meus treinos" }),
    ).toBeTruthy();
    expect(screen.getByText("Segunda")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Peito e tríceps/ })
        .getAttribute("href"),
    ).toBe("/treinos/sessao?sessao=62000000-0000-4000-8000-000000000002");
    expect(screen.getByRole("link", { name: "Voltar" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("Prévia")).toBeNull();
  });
});
