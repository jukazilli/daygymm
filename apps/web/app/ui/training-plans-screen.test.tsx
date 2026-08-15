import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TrainingPlanEditorGateway,
  TrainingPlanSummary,
} from "@daygym/contracts";

import { TrainingPlansScreen } from "./training-plans-screen";

const activePlan: TrainingPlanSummary = {
  archivedAt: null,
  currentVersion: 10,
  itemCount: 38,
  name: "Plano atual",
  planId: "10000000-0000-4000-8000-000000000001",
  provenance: "manual",
  sessionCount: 6,
  updatedAt: "2026-08-15T15:00:00.000Z",
};

const archivedPlan: TrainingPlanSummary = {
  ...activePlan,
  archivedAt: "2026-08-14T15:00:00.000Z",
  currentVersion: 3,
  name: "Plano anterior",
  planId: "20000000-0000-4000-8000-000000000002",
};

function createGateway(
  plans: readonly TrainingPlanSummary[],
): TrainingPlanEditorGateway {
  return {
    archive: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, value: plans }),
    load: vi.fn(),
    publish: vi.fn(),
    restore: vi.fn().mockResolvedValue({
      ok: true,
      value: { planId: archivedPlan.planId, wasChanged: true },
    }),
  };
}

afterEach(cleanup);

describe("TrainingPlansScreen", () => {
  it("lists plan names, versions and status before editing", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();

    render(
      createElement(TrainingPlansScreen, {
        gateway: createGateway([activePlan, archivedPlan]),
        navigate,
      }),
    );

    expect(
      await screen.findByText("Versão 10 · 6 treinos · 38 exercícios"),
    ).toBeTruthy();
    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.getByText("Arquivado")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Editar Plano atual, versão 10",
      }),
    );
    expect(navigate).toHaveBeenCalledWith(
      `/treinos/plano/?plano=${activePlan.planId}`,
    );
  });

  it("explains the active-plan change before starting from zero", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();

    render(
      createElement(TrainingPlansScreen, {
        gateway: createGateway([activePlan]),
        navigate,
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog", {
      name: "Criar um novo plano?",
    });
    expect(
      within(dialog).getByText(/Ao salvar o novo plano, ele se torna ativo/),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Começar novo plano" }),
    );
    expect(navigate).toHaveBeenCalledWith("/treinos/plano/?novo=1");
  });

  it("restores an archived plan before opening its editor", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const gateway = createGateway([activePlan, archivedPlan]);

    render(
      createElement(TrainingPlansScreen, {
        gateway,
        navigate,
      }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Ativar Plano anterior, versão 3",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Ativar este plano?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Ativar e editar" }),
    );

    await waitFor(() => expect(gateway.restore).toHaveBeenCalledOnce());
    expect(gateway.restore).toHaveBeenCalledWith(archivedPlan.planId);
    expect(navigate).toHaveBeenCalledWith(
      `/treinos/plano/?plano=${archivedPlan.planId}`,
    );
  });
});
