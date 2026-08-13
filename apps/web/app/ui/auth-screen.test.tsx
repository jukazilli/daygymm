import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway } from "../../lib/auth-gateway";
import { AuthScreen } from "./auth-screen";

function createGateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    exchangeAuthCode: vi.fn().mockResolvedValue({
      ok: true,
      value: undefined,
    }),
    hasActiveEligibleSession: vi.fn().mockResolvedValue({
      ok: true,
      value: true,
    }),
    requestPasswordReset: vi.fn().mockResolvedValue({
      ok: true,
      value: undefined,
    }),
    signIn: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    signOut: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    signUp: vi.fn().mockResolvedValue({ ok: true, value: "check-email" }),
    updatePasswordAndSignOut: vi.fn().mockResolvedValue({
      ok: true,
      value: undefined,
    }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("AuthScreen", () => {
  it("shows only a generic credential error during sign in", async () => {
    const user = userEvent.setup();
    const gateway = createGateway({
      signIn: vi.fn().mockResolvedValue({
        ok: false,
        reason: "credentials",
      }),
    });

    render(createElement(AuthScreen, { gateway, mode: "sign-in" }));
    await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível entrar. Confira os dados e tente novamente.",
    );
    expect(document.body.textContent).not.toContain("user_not_found");
  });

  it("blocks account creation until all local requirements are valid", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();

    render(createElement(AuthScreen, { gateway, mode: "sign-up" }));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Digite um e-mail válido.")).toBeTruthy();
    expect(screen.getByText("Use pelo menos 8 caracteres.")).toBeTruthy();
    expect(
      screen.getByText("Confirme que você tem 18 anos ou mais."),
    ).toBeTruthy();
    expect(
      screen.getByText("Aceite os Termos de teste para continuar."),
    ).toBeTruthy();
    expect(
      screen.getByText("Confirme a leitura do Aviso de privacidade."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("E-mail")),
    );
    expect(gateway.signUp).not.toHaveBeenCalled();
  });

  it("submits versioned account eligibility and keeps the result non-enumerable", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();

    render(createElement(AuthScreen, { gateway, mode: "sign-up" }));
    await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha-segura");
    await user.click(
      screen.getByLabelText("Confirmo que tenho 18 anos ou mais."),
    );
    await user.click(screen.getByLabelText("Li e aceito os Termos de teste."));
    await user.click(screen.getByLabelText("Li o Aviso de privacidade."));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(gateway.signUp).toHaveBeenCalledWith({
      email: "pessoa@example.com",
      isAdult: true,
      password: "senha-segura",
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Se o endereço puder ser usado, você receberá um link para continuar.",
    );
  });

  it("uses the same generic recovery result for any submitted address", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();

    render(createElement(AuthScreen, { gateway, mode: "recover" }));
    await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(gateway.requestPasswordReset).toHaveBeenCalledWith(
      "pessoa@example.com",
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Se o endereço puder ser usado, você receberá um link para continuar.",
    );
  });

  it("exchanges the PKCE confirmation code before opening the account", async () => {
    const gateway = createGateway();
    const navigate = vi.fn();
    window.history.replaceState({}, "", "/entrar/?code=confirmation-code");

    render(
      createElement(AuthScreen, {
        gateway,
        mode: "sign-in",
        navigate,
      }),
    );

    await waitFor(() =>
      expect(gateway.exchangeAuthCode).toHaveBeenCalledWith(
        "confirmation-code",
      ),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/conta/"));
    expect(window.location.search).toBe("");
  });
});
