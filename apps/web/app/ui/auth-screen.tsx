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
  "account" | "recover" | "reset-password" | "sign-in" | "sign-up";

interface AuthScreenProps {
  readonly gateway?: AuthGateway;
  readonly mode: AuthMode;
  readonly navigate?: (path: string) => void;
}

type FieldName =
  "adult" | "email" | "password" | "passwordConfirmation" | "privacy" | "terms";

type FieldErrors = Partial<Record<FieldName, string>>;

const copyByFailure: Record<AuthFailure, string> = {
  "account-incomplete":
    "Não foi possível concluir o acesso desta conta. Tente criar a conta novamente.",
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
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "unavailable"
  >(mode === "account" ? "checking" : "ready");

  function gateway() {
    gatewayRef.current ??= createWebAuthGateway();
    return gatewayRef.current;
  }

  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("code");

    if (mode === "reset-password") {
      if (!code) {
        setFeedback(copyByFailure["link-invalid"]);
        return;
      }

      void gateway()
        .exchangeAuthCode(code)
        .then((result) => {
          window.history.replaceState({}, "", "/redefinir-senha/");
          if (result.ok) {
            setIsRecoveryReady(true);
          } else {
            setFeedback(copyByFailure[result.reason]);
          }
        });
    }

    if (mode === "sign-in" && code) {
      setIsLoading(true);
      void gateway()
        .exchangeAuthCode(code)
        .then((result) => {
          window.history.replaceState({}, "", "/entrar/");
          setIsLoading(false);
          if (result.ok) {
            navigate("/comecar/");
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
      setFeedback(copyByFailure[result.reason]);
      return;
    }

    if (mode === "sign-in") {
      navigate("/comecar/");
    } else if (mode === "sign-up" || mode === "recover") {
      setRecoveryRequested(true);
    } else {
      navigate("/entrar/?senha=alterada");
    }
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

        {recoveryRequested ? (
          <div className="status-message status-success" role="status">
            <strong>Confira seu e-mail.</strong>
            <span>
              Se o endereço puder ser usado, você receberá um link para
              continuar.
            </span>
          </div>
        ) : (
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
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
