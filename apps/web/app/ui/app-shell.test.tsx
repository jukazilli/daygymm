import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

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
});
