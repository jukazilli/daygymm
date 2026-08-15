import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell, FocusedBackAction } from "./app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("keeps the five canonical destinations scannable and names the active one", () => {
    render(
      createElement(AppShell, {
        active: "today",
        children: createElement("p", null, "Conteúdo"),
      }),
    );

    const navigation = screen.getByRole("navigation", {
      name: "Navegação principal",
    });
    expect(navigation.querySelectorAll("a")).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "Hoje" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Treinos" }).getAttribute("href"),
    ).toBe("/treinos");
    expect(
      screen.getByRole("link", { name: "Feed" }).getAttribute("href"),
    ).toBe("/feed");
  });

  it("removes institutional chrome from a focused task", () => {
    render(
      createElement(AppShell, {
        active: "workouts",
        children: createElement("h1", null, "Montar plano"),
        variant: "focused",
      }),
    );

    expect(screen.queryByRole("link", { name: /DayGym/ })).toBeNull();
    expect(screen.queryByText("Prévia")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("heading", { name: "Montar plano" })).toBeTruthy();
  });

  it("keeps the focused back action inside an opaque fixed header", () => {
    render(
      createElement(AppShell, {
        active: "workouts",
        children: [
          createElement(FocusedBackAction, {
            href: "/treinos/",
            key: "back",
          }),
          createElement("h1", { key: "title" }, "Planos de treino"),
        ],
        variant: "focused",
      }),
    );

    expect(
      screen.getByRole("link", { name: "Voltar" }).closest(".focused-header"),
    ).toBeTruthy();
  });
});
