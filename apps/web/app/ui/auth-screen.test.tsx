import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    resendSignUpConfirmation: vi.fn().mockResolvedValue({
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
    verifyEmailToken: vi.fn().mockResolvedValue({
      ok: true,
      value: undefined,
    }),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it("offers a resend only after the 80-second signup cooldown", async () => {
    vi.useFakeTimers();
    const gateway = createGateway();

    render(createElement(AuthScreen, { gateway, mode: "sign-up" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(
      screen.getByLabelText("Confirmo que tenho 18 anos ou mais."),
    );
    fireEvent.click(screen.getByLabelText("Li e aceito os Termos de teste."));
    fireEvent.click(screen.getByLabelText("Li o Aviso de privacidade."));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    });

    expect(
      (
        screen.getByRole("button", {
          name: "Reenviar em 01:20",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    for (let second = 0; second < 80; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar link" }));
    });

    expect(gateway.resendSignUpConfirmation).toHaveBeenCalledWith(
      "pessoa@example.com",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Enviamos um novo link.",
    );
  });

  it("reconciles the signup cooldown with elapsed wall-clock time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T00:00:00.000Z"));
    const gateway = createGateway();

    render(createElement(AuthScreen, { gateway, mode: "sign-up" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(
      screen.getByLabelText("Confirmo que tenho 18 anos ou mais."),
    );
    fireEvent.click(screen.getByLabelText("Li e aceito os Termos de teste."));
    fireEvent.click(screen.getByLabelText("Li o Aviso de privacidade."));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    });

    vi.setSystemTime(new Date("2026-08-16T00:01:21.000Z"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("button", { name: "Reenviar link" })).toBeTruthy();
  });

  it("turns an ambiguous first failure into a recoverable pending state", async () => {
    const user = userEvent.setup();
    const gateway = createGateway({
      signUp: vi.fn().mockResolvedValue({
        ok: false,
        reason: "unexpected",
      }),
    });

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

    expect((await screen.findByRole("status")).textContent).toContain(
      "O envio está demorando.",
    );
    expect(document.body.textContent).not.toContain(
      "Não foi possível concluir agora.",
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
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/hoje/"));
    expect(window.location.search).toBe("");
  });

  it("keeps a confirmation GET inert and verifies the token only after a click", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();
    const navigate = vi.fn();
    window.history.replaceState(
      {},
      "",
      "/confirmar-email/#token_hash=synthetic-hash&type=email",
    );

    render(
      createElement(AuthScreen, {
        gateway,
        mode: "confirm-email",
        navigate,
      }),
    );

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(gateway.verifyEmailToken).not.toHaveBeenCalled();
    expect(gateway.exchangeAuthCode).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirmar meu e-mail" }),
    );

    expect(gateway.verifyEmailToken).toHaveBeenCalledWith(
      "synthetic-hash",
      "confirmation",
    );
    expect(navigate).toHaveBeenCalledWith("/hoje/");
  });

  it("requires an explicit action before starting password recovery", async () => {
    const user = userEvent.setup();
    const gateway = createGateway();
    window.history.replaceState(
      {},
      "",
      "/redefinir-senha/#token_hash=recovery-hash&type=recovery",
    );

    render(createElement(AuthScreen, { gateway, mode: "reset-password" }));

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(gateway.verifyEmailToken).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Continuar com segurança" }),
    );

    expect(gateway.verifyEmailToken).toHaveBeenCalledWith(
      "recovery-hash",
      "recovery",
    );
    expect(await screen.findByLabelText("Nova senha")).toBeTruthy();
  });

  it("offers sign in without revealing whether a confirmation link was reused", async () => {
    const user = userEvent.setup();
    const gateway = createGateway({
      verifyEmailToken: vi.fn().mockResolvedValue({
        ok: false,
        reason: "link-invalid",
      }),
    });
    window.history.replaceState(
      {},
      "",
      "/confirmar-email/#token_hash=used-hash&type=email",
    );

    render(createElement(AuthScreen, { gateway, mode: "confirm-email" }));
    await user.click(
      await screen.findByRole("button", { name: "Confirmar meu e-mail" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "E-mail já confirmado ou link expirado.",
    );
    expect(screen.getByRole("link", { name: "Ir para entrar" })).toBeTruthy();
  });
});
