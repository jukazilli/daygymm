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
  TrainingPlanDraft,
  TrainingPlanEditorGateway,
} from "@daygym/contracts";

import { TrainingPlanEditorScreen } from "./training-plan-editor-screen";

const existingPlanId = "10000000-0000-4000-8000-000000000001";

const existingDraft: TrainingPlanDraft = {
  currentVersion: 1,
  name: "Plano atual",
  planId: existingPlanId,
  sessions: [
    {
      dayOrder: 1,
      items: [
        {
          circuitGroup: null,
          distanceMeters: null,
          durationSeconds: null,
          exerciseName: "Supino reto",
          itemId: "20000000-0000-4000-8000-000000000002",
          loadIncrementKg: null,
          loadMode: "unconfigured",
          modality: "strength",
          notes: null,
          order: 1,
          plannedWeightKg: null,
          repsMax: 12,
          repsMin: 8,
          restSeconds: 90,
          sets: 3,
        },
        {
          circuitGroup: null,
          distanceMeters: null,
          durationSeconds: 1_200,
          exerciseName: "Esteira",
          itemId: "30000000-0000-4000-8000-000000000003",
          loadIncrementKg: null,
          loadMode: "none",
          modality: "cardio",
          notes: null,
          order: 2,
          plannedWeightKg: null,
          repsMax: null,
          repsMin: null,
          restSeconds: 0,
          sets: 1,
        },
      ],
      name: "Treino A",
      sessionId: "40000000-0000-4000-8000-000000000004",
    },
  ],
};

const carouselDraft: TrainingPlanDraft = {
  ...existingDraft,
  sessions: [
    ...existingDraft.sessions,
    {
      dayOrder: 2,
      items: [
        {
          ...existingDraft.sessions[0]!.items[0]!,
          exerciseName: "Remada baixa",
          itemId: "60000000-0000-4000-8000-000000000006",
        },
      ],
      name: "Treino B",
      sessionId: "70000000-0000-4000-8000-000000000007",
    },
  ],
};

function createGateway(
  draft: TrainingPlanDraft | null,
): TrainingPlanEditorGateway {
  return {
    archive: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        archivedAt: "2026-08-15T00:00:00.000Z",
        planId: existingPlanId,
        wasChanged: true,
      },
    }),
    load: vi.fn().mockResolvedValue({ ok: true, value: draft }),
    publish: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        itemCount: 2,
        name: "Plano atual",
        planId: existingPlanId,
        sessionCount: 1,
        version: 2,
        versionId: "50000000-0000-4000-8000-000000000005",
        wasCreated: true,
      },
    }),
    restore: vi.fn().mockResolvedValue({
      ok: true,
      value: { planId: existingPlanId, wasChanged: true },
    }),
  };
}

afterEach(cleanup);

describe("TrainingPlanEditorScreen", () => {
  it("creates the first manual plan with a version summary", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(null);
    const navigate = vi.fn();

    render(createElement(TrainingPlanEditorScreen, { gateway, navigate }));

    const exercise = await screen.findByRole("textbox", {
      name: "Exercício",
    });
    await user.type(exercise, "Agachamento");
    await user.click(screen.getByRole("button", { name: "Criar plano" }));

    await waitFor(() => expect(gateway.publish).toHaveBeenCalledOnce());
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSummary: "Criei o plano",
        name: "Meu plano",
        planId: null,
      }),
    );
    expect(navigate).toHaveBeenCalledWith("/treinos/");
  });

  it("switches compact training and exercise cards without losing edits", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(carouselDraft);

    render(
      createElement(TrainingPlanEditorScreen, {
        gateway,
        navigate: vi.fn(),
      }),
    );

    const exerciseField = await screen.findByRole("textbox", {
      name: "Exercício",
    });
    expect((exerciseField as HTMLInputElement).value).toBe("Supino reto");

    await user.click(screen.getByRole("tab", { name: /Esteira/ }));
    expect((exerciseField as HTMLInputElement).value).toBe("Esteira");
    await user.clear(exerciseField);
    await user.type(exerciseField, "Caminhada inclinada");

    const firstTraining = screen.getByRole("tab", { name: /Treino A/ });
    firstTraining.focus();
    await user.keyboard("{ArrowRight}");
    expect((exerciseField as HTMLInputElement).value).toBe("Remada baixa");

    const secondTraining = screen.getByRole("tab", { name: /Treino B/ });
    await waitFor(() => expect(document.activeElement).toBe(secondTraining));
    await user.keyboard("{ArrowLeft}");
    await user.click(screen.getByRole("tab", { name: /Caminhada inclinada/ }));
    expect((exerciseField as HTMLInputElement).value).toBe(
      "Caminhada inclinada",
    );
  });

  it("opens the hidden training that has an invalid required field", async () => {
    const user = userEvent.setup();
    const gateway = createGateway({
      ...carouselDraft,
      sessions: carouselDraft.sessions.map((session, sessionIndex) => ({
        ...session,
        items: session.items.map((item) => ({
          ...item,
          exerciseName: sessionIndex === 1 ? "" : item.exerciseName,
        })),
      })),
    });

    render(
      createElement(TrainingPlanEditorScreen, {
        gateway,
        navigate: vi.fn(),
      }),
    );

    await screen.findByRole("textbox", { name: "Exercício" });
    await user.click(
      screen.getByRole("button", { name: "Salvar nova versão" }),
    );

    expect(gateway.publish).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Revise os campos obrigatórios do Treino 2."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: /Treino B/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      (screen.getByRole("textbox", { name: "Exercício" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("configures load only for eligible strength exercises", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(existingDraft);

    render(
      createElement(TrainingPlanEditorScreen, {
        gateway,
        mode: "loads",
        navigate: vi.fn(),
      }),
    );

    expect(await screen.findByText("Supino reto")).toBeTruthy();
    expect(screen.queryByText("Esteira")).toBeNull();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Como você treina?" }),
      "external",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Carga inicial (kg)" }),
      "40",
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: "Passo do equipamento (kg)",
      }),
      "2.5",
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar nova versão" }),
    );

    await waitFor(() => expect(gateway.publish).toHaveBeenCalledOnce());
    const published = vi.mocked(gateway.publish).mock.calls[0]?.[0];
    expect(published?.sessions[0]?.items[0]).toEqual(
      expect.objectContaining({
        loadIncrementKg: 2.5,
        loadMode: "external",
        plannedWeightKg: 40,
      }),
    );
    expect(published?.sessions[0]?.items[1]).toEqual(
      expect.objectContaining({ loadMode: "none", modality: "cardio" }),
    );
  });

  it("archives a plan without losing the option to undo", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(existingDraft);

    render(
      createElement(TrainingPlanEditorScreen, {
        gateway,
        navigate: vi.fn(),
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Arquivar plano" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Arquivar este plano?" });
    await user.click(
      within(dialog).getByRole("button", { name: "Arquivar plano" }),
    );
    expect(await screen.findByText("O histórico foi preservado.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => expect(gateway.restore).toHaveBeenCalledOnce());
  });
});
