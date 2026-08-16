"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  createWebAuthGateway,
  type AuthFailure,
  type AuthGateway,
} from "../../lib/auth-gateway";

export type AuthMode =
  | "account"
  | "confirm-email"
  | "recover"
  | "reset-password"
  | "sign-in"
  | "sign-up";

interface AuthScreenProps {
  readonly gateway?: AuthGateway;
  readonly mode: AuthMode;
  readonly navigate?: (path: string) => void;
}

type FieldName =
  "adult" | "email" | "password" | "passwordConfirmation" | "privacy" | "terms";

type FieldErrors = Partial<Record<FieldName, string>>;

const SIGN_UP_RESEND_COOLDOWN_SECONDS = 80;

const copyByFailure: Record<AuthFailure, string> = {
  "account-incomplete":
    "Esta conta precisa de revisão. Entre em contato com o suporte.",
  configuration:
    "O acesso está temporariamente indisponível. Tente novamente mais tarde.",
  credentials: "Não foi possível entrar. Confira os dados e tente novamente.",
  "link-invalid":
    "Este link não é mais válido. Solicite um novo link para continuar.",
  "rate-limited":
    "Muitas tentativas seguidas. Aguarde um pouco e tente de novo.",
  unexpected: "Não foi possível concluir agora. Tente novamente.",
};

const modeCopy = {
  "confirm-email": {
    eyebrow: "Confirmar e-mail",
    title: "Só falta confirmar.",
    support:
      "Toque no botão abaixo para concluir. Abrir esta página não confirma sua conta.",
  },
  recover: {
    eyebrow: "Recuperar acesso",
    title: "Vamos enviar um link.",
    support: "Use o e-mail da sua conta.",
  },
  "reset-password": {
    eyebrow: "Nova senha",
    title: "Crie uma senha segura.",
    support: "Depois da troca, entre novamente na sua conta.",
  },
  "sign-in": {
    eyebrow: "Sua conta",
    title: "Continue seu treino.",
    support: "Entre para acessar seu plano e sua evolução.",
  },
  "sign-up": {
    eyebrow: "Criar conta",
    title: "Comece com direção.",
    support: "Seu plano, seus registros e sua evolução em um só lugar.",
  },
} as const;

type PendingAuthLink =
  | { readonly kind: "pkce"; readonly value: string }
  | { readonly kind: "token-hash"; readonly value: string };

function captureAuthLink(mode: AuthMode): PendingAuthLink | undefined {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const expectedType = mode === "confirm-email" ? "email" : "recovery";
  const tokenHash = fragment.get("token_hash");
  const code = url.searchParams.get("code");

  if (tokenHash && fragment.get("type") === expectedType) {
    return { kind: "token-hash", value: tokenHash };
  }

  return code ? { kind: "pkce", value: code } : undefined;
}

function defaultNavigate(path: string) {
  window.location.assign(path);
}

function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="DayGym">
        <a className="brand" href="/entrar/" aria-label="DayGym — entrar">
          DayGym
        </a>
        <div className="story-copy">
          <p className="eyebrow">Treino com direção</p>
          <p className="story-title">
            Plano claro. Registro rápido. Evolução visível.
          </p>
        </div>
        <p className="environment">Prévia interna · somente dados sintéticos</p>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}

function Field({
  autoComplete,
  error,
  id,
  label,
  minLength,
  type,
}: Readonly<{
  autoComplete: string;
  error?: string;
  id: FieldName;
  label: string;
  minLength?: number;
  type: "email" | "password";
}>) {
  const errorId = `${id}-error`;

  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        id={id}
        minLength={minLength}
        name={id}
        required
        type={type}
      />
      {error ? (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function focusFirstError(errors: FieldErrors) {
  const firstField = (
    [
      "email",
      "password",
      "passwordConfirmation",
      "adult",
      "terms",
      "privacy",
    ] as const
  ).find((field) => errors[field]);
  if (firstField) {
    document.getElementById(firstField)?.focus();
  }
}

function validateEmail(value: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : "Digite um e-mail válido.";
}

function validatePassword(value: string): string | undefined {
  return value.length >= 8 ? undefined : "Use pelo menos 8 caracteres.";
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function AuthScreen({
  gateway: providedGateway,
  mode,
  navigate = defaultNavigate,
}: AuthScreenProps) {
  const gatewayRef = useRef<AuthGateway | undefined>(providedGateway);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(
    mode !== "reset-password",
  );
  const [pendingAuthLink, setPendingAuthLink] = useState<PendingAuthLink>();
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number>();
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendSucceeded, setResendSucceeded] = useState(false);
  const [signUpDeliveryUncertain, setSignUpDeliveryUncertain] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "unavailable"
  >(mode === "account" ? "checking" : "ready");

  function gateway() {
    gatewayRef.current ??= createWebAuthGateway();
    return gatewayRef.current;
  }

  function startResendCooldown() {
    const availableAt = Date.now() + SIGN_UP_RESEND_COOLDOWN_SECONDS * 1_000;
    setResendAvailableAt(availableAt);
    setResendSeconds(SIGN_UP_RESEND_COOLDOWN_SECONDS);
  }

  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("code");

    if (mode === "confirm-email" || mode === "reset-password") {
      const link = captureAuthLink(mode);
      window.history.replaceState(
        {},
        "",
        mode === "confirm-email" ? "/confirmar-email/" : "/redefinir-senha/",
      );
      setPendingAuthLink(link);
      if (!link) {
        setFeedback(copyByFailure["link-invalid"]);
      }
      return;
    }

    if (mode === "sign-in" && code) {
      setIsLoading(true);
      void gateway()
        .exchangeAuthCode(code)
        .then((result) => {
          window.history.replaceState({}, "", "/entrar/");
          setIsLoading(false);
          if (result.ok) {
            navigate("/hoje/");
          } else {
            setFeedback(copyByFailure[result.reason]);
          }
        });
    }

    if (mode === "account") {
      void gateway()
        .hasActiveEligibleSession()
        .then((result) => {
          if (result.ok && result.value) {
            setSessionState("ready");
          } else if (result.ok) {
            navigate("/entrar/");
          } else {
            setFeedback(copyByFailure[result.reason]);
            setSessionState("unavailable");
          }
        });
    }
  }, [mode, navigate]);

  useEffect(() => {
    if (!resendAvailableAt) {
      return;
    }

    function updateCountdown() {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt! - Date.now()) / 1_000),
      );
      setResendSeconds(remaining);
      if (remaining === 0) {
        setResendAvailableAt(undefined);
      }
    }

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    window.addEventListener("focus", updateCountdown);
    document.addEventListener("visibilitychange", updateCountdown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateCountdown);
      document.removeEventListener("visibilitychange", updateCountdown);
    };
  }, [resendAvailableAt]);

  async function handleAuthLink() {
    if (!pendingAuthLink) {
      return;
    }

    setFeedback(undefined);
    setIsLoading(true);
    const result =
      pendingAuthLink.kind === "token-hash"
        ? await gateway().verifyEmailToken(
            pendingAuthLink.value,
            mode === "confirm-email" ? "confirmation" : "recovery",
          )
        : await gateway().exchangeAuthCode(pendingAuthLink.value);
    setIsLoading(false);

    if (!result.ok) {
      setPendingAuthLink(undefined);
      setFeedback(copyByFailure[result.reason]);
      return;
    }

    setPendingAuthLink(undefined);
    if (mode === "confirm-email") {
      navigate("/hoje/");
    } else {
      setIsRecoveryReady(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    const nextErrors: FieldErrors = {};

    if (mode !== "reset-password") {
      nextErrors.email = validateEmail(email);
    }
    if (mode !== "recover") {
      nextErrors.password = validatePassword(password);
    }
    if (mode === "sign-up" || mode === "reset-password") {
      nextErrors.passwordConfirmation =
        password === passwordConfirmation
          ? undefined
          : "As senhas precisam ser iguais.";
    }
    if (mode === "sign-up") {
      nextErrors.adult = form.get("adult")
        ? undefined
        : "Confirme que você tem 18 anos ou mais.";
      nextErrors.terms = form.get("terms")
        ? undefined
        : "Aceite os Termos de teste para continuar.";
      nextErrors.privacy = form.get("privacy")
        ? undefined
        : "Confirme a leitura do Aviso de privacidade.";
    }

    const presentErrors = Object.fromEntries(
      Object.entries(nextErrors).filter((entry) => entry[1]),
    ) as FieldErrors;
    setErrors(presentErrors);
    if (Object.keys(presentErrors).length > 0) {
      window.setTimeout(() => focusFirstError(presentErrors), 0);
      return;
    }

    setIsLoading(true);
    let result;
    if (mode === "sign-in") {
      result = await gateway().signIn(email, password);
    } else if (mode === "sign-up") {
      result = await gateway().signUp({ email, password, isAdult: true });
    } else if (mode === "recover") {
      result = await gateway().requestPasswordReset(email);
    } else {
      result = await gateway().updatePasswordAndSignOut(password);
    }
    setIsLoading(false);

    if (!result.ok) {
      if (
        mode === "sign-up" &&
        (result.reason === "rate-limited" || result.reason === "unexpected")
      ) {
        setSubmittedEmail(email);
        setSignUpDeliveryUncertain(true);
        setRecoveryRequested(true);
        startResendCooldown();
        return;
      }
      setFeedback(copyByFailure[result.reason]);
      return;
    }

    if (mode === "sign-in") {
      navigate("/hoje/");
    } else if (mode === "sign-up" || mode === "recover") {
      if (mode === "sign-up") {
        setSubmittedEmail(email);
        setSignUpDeliveryUncertain(false);
        startResendCooldown();
      }
      setRecoveryRequested(true);
    } else {
      navigate("/entrar/?senha=alterada");
    }
  }

  async function handleSignUpResend() {
    if (!submittedEmail || resendSeconds > 0) {
      return;
    }

    setFeedback(undefined);
    setResendSucceeded(false);
    setIsLoading(true);
    const result = await gateway().resendSignUpConfirmation(submittedEmail);
    setIsLoading(false);
    startResendCooldown();

    if (!result.ok) {
      setSignUpDeliveryUncertain(true);
      setFeedback(copyByFailure[result.reason]);
      return;
    }

    setSignUpDeliveryUncertain(false);
    setResendSucceeded(true);
  }

  async function handleSignOut() {
    setIsLoading(true);
    const result = await gateway().signOut();
    setIsLoading(false);
    if (result.ok) {
      navigate("/entrar/");
    } else {
      setFeedback(copyByFailure[result.reason]);
    }
  }

  if (mode === "account") {
    const accountTitle = {
      checking: "Verificando acesso…",
      ready: "Conta pronta.",
      unavailable: "Acesso indisponível.",
    }[sessionState];

    return (
      <AuthLayout>
        <div className="auth-card">
          <p className="eyebrow">Sua conta</p>
          <h1>{accountTitle}</h1>
          {sessionState === "ready" ? (
            <>
              <p className="support">Seu acesso está ativo neste aparelho.</p>
              <button
                className="button-primary"
                disabled={isLoading}
                onClick={() => void handleSignOut()}
                type="button"
              >
                {isLoading ? "Saindo…" : "Sair neste aparelho"}
              </button>
            </>
          ) : null}
          {feedback ? (
            <p className="status-message status-error" role="alert">
              {feedback}
            </p>
          ) : null}
        </div>
      </AuthLayout>
    );
  }

  if (mode === "confirm-email") {
    const pageCopy = modeCopy[mode];

    return (
      <AuthLayout>
        <div className="auth-card">
          <p className="eyebrow">{pageCopy.eyebrow}</p>
          <h1>{pageCopy.title}</h1>
          <p className="support">{pageCopy.support}</p>
          {feedback ? (
            <div className="status-message status-error" role="alert">
              <strong>E-mail já confirmado ou link expirado.</strong>
              <span>
                Tente entrar na sua conta. Se ainda precisar confirmar, crie a
                conta novamente para receber um novo link.
              </span>
            </div>
          ) : null}
          {pendingAuthLink ? (
            <button
              className="button-primary"
              disabled={isLoading}
              onClick={() => void handleAuthLink()}
              type="button"
            >
              {isLoading ? "Confirmando…" : "Confirmar meu e-mail"}
            </button>
          ) : null}
          <nav className="auth-links" aria-label="Outras opções de acesso">
            <a href="/entrar/">Ir para entrar</a>
          </nav>
        </div>
      </AuthLayout>
    );
  }

  const pageCopy = modeCopy[mode];
  const buttonLabel = {
    recover: isLoading ? "Enviando…" : "Enviar link",
    "reset-password": isLoading ? "Salvando…" : "Salvar nova senha",
    "sign-in": isLoading ? "Entrando…" : "Entrar",
    "sign-up": isLoading ? "Criando…" : "Criar conta",
  }[mode];

  return (
    <AuthLayout>
      <div className="auth-card">
        <p className="eyebrow">{pageCopy.eyebrow}</p>
        <h1>{pageCopy.title}</h1>
        <p className="support">{pageCopy.support}</p>

        {mode === "reset-password" && !isRecoveryReady ? (
          <>
            {feedback ? (
              <p className="status-message status-error" role="alert">
                {feedback}
              </p>
            ) : null}
            {pendingAuthLink ? (
              <button
                className="button-primary"
                disabled={isLoading}
                onClick={() => void handleAuthLink()}
                type="button"
              >
                {isLoading ? "Verificando…" : "Continuar com segurança"}
              </button>
            ) : null}
          </>
        ) : recoveryRequested ? (
          <div
            className={`status-message ${
              signUpDeliveryUncertain ? "status-pending" : "status-success"
            }`}
          >
            <div className="auth-status-copy" role="status">
              <strong>
                {signUpDeliveryUncertain
                  ? "O envio está demorando."
                  : resendSucceeded
                    ? "Enviamos um novo link."
                    : "Confira seu e-mail."}
              </strong>
              <span>
                {signUpDeliveryUncertain
                  ? "Aguarde um pouco antes de tentar novamente."
                  : "Se o endereço puder ser usado, você receberá um link para continuar."}
              </span>
            </div>
            {mode === "sign-up" ? (
              <div className="auth-resend">
                <span>Não recebeu o link?</span>
                <button
                  className="button-primary"
                  disabled={isLoading || resendSeconds > 0}
                  onClick={() => void handleSignUpResend()}
                  type="button"
                >
                  {isLoading
                    ? "Reenviando…"
                    : resendSeconds > 0
                      ? `Reenviar em ${formatCountdown(resendSeconds)}`
                      : "Reenviar link"}
                </button>
              </div>
            ) : null}
            {feedback ? (
              <span className="field-error" role="alert">
                {feedback}
              </span>
            ) : null}
          </div>
        ) : (
          <form
            className="auth-form"
            method="post"
            noValidate
            onSubmit={handleSubmit}
          >
            {mode !== "reset-password" ? (
              <Field
                autoComplete="email"
                error={errors.email}
                id="email"
                label="E-mail"
                type="email"
              />
            ) : null}
            {mode !== "recover" ? (
              <Field
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                error={errors.password}
                id="password"
                label={mode === "reset-password" ? "Nova senha" : "Senha"}
                minLength={8}
                type="password"
              />
            ) : null}
            {mode === "sign-up" || mode === "reset-password" ? (
              <Field
                autoComplete="new-password"
                error={errors.passwordConfirmation}
                id="passwordConfirmation"
                label="Confirmar senha"
                minLength={8}
                type="password"
              />
            ) : null}

            {mode === "sign-up" ? (
              <fieldset className="consent-group">
                <legend>Confirmações necessárias</legend>
                <label className="check-row" htmlFor="adult">
                  <input
                    aria-describedby={errors.adult ? "adult-error" : undefined}
                    aria-invalid={Boolean(errors.adult)}
                    id="adult"
                    name="adult"
                    type="checkbox"
                  />
                  <span>Confirmo que tenho 18 anos ou mais.</span>
                </label>
                {errors.adult ? (
                  <span className="field-error" id="adult-error">
                    {errors.adult}
                  </span>
                ) : null}
                <label className="check-row" htmlFor="terms">
                  <input
                    aria-describedby={errors.terms ? "terms-error" : undefined}
                    aria-invalid={Boolean(errors.terms)}
                    id="terms"
                    name="terms"
                    type="checkbox"
                  />
                  <span>
                    Li e aceito os <a href="/termos/">Termos de teste</a>.
                  </span>
                </label>
                {errors.terms ? (
                  <span className="field-error" id="terms-error">
                    {errors.terms}
                  </span>
                ) : null}
                <label className="check-row" htmlFor="privacy">
                  <input
                    aria-describedby={
                      errors.privacy ? "privacy-error" : undefined
                    }
                    aria-invalid={Boolean(errors.privacy)}
                    id="privacy"
                    name="privacy"
                    type="checkbox"
                  />
                  <span>
                    Li o <a href="/privacidade/">Aviso de privacidade</a>.
                  </span>
                </label>
                {errors.privacy ? (
                  <span className="field-error" id="privacy-error">
                    {errors.privacy}
                  </span>
                ) : null}
              </fieldset>
            ) : null}

            {feedback ? (
              <p className="status-message status-error" role="alert">
                {feedback}
              </p>
            ) : null}

            <button
              className="button-primary"
              disabled={isLoading || !isRecoveryReady}
              type="submit"
            >
              {buttonLabel}
            </button>
          </form>
        )}

        <nav className="auth-links" aria-label="Outras opções de acesso">
          {mode === "sign-in" ? (
            <>
              <a href="/recuperar-acesso/">Esqueci minha senha</a>
              <span>
                Ainda não tem conta? <a href="/criar-conta/">Criar conta</a>
              </span>
            </>
          ) : (
            <a href="/entrar/">Voltar para entrar</a>
          )}
        </nav>
      </div>
    </AuthLayout>
  );
}
