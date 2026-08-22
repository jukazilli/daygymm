import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell, FocusedBackAction } from "./app-shell";

const initialOnline = navigator.onLine;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

afterEach(() => {
  cleanup();
  setOnline(initialOnline);
});

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
    expect(screen.queryByText("Prévia")).toBeNull();
    expect(screen.queryByText("Modo offline")).toBeNull();
  });

  it("shows connectivity only while the app is offline", () => {
    render(
      createElement(AppShell, {
        active: "today",
        children: createElement("p", null, "Conteúdo"),
      }),
    );

    act(() => setOnline(false));
    expect(screen.getByRole("status").textContent).toBe("Modo offline");

    act(() => setOnline(true));
    expect(screen.queryByText("Modo offline")).toBeNull();
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
