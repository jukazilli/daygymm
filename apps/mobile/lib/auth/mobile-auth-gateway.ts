import * as Linking from "expo-linking";

import {
  stagingLegalVersions,
  type AuthFailure,
  type AuthGateway,
} from "@daygym/contracts";

import { createMobileAuthRuntime } from "./mobile-auth-client";

type MobileAuthRuntime = ReturnType<typeof createMobileAuthRuntime>;
type MobileAuthClient = MobileAuthRuntime["client"];

export interface DisposableMobileAuthGateway extends AuthGateway {
  dispose(): Promise<void>;
}

interface MobileAuthGatewayOptions {
  readonly client?: MobileAuthClient;
  readonly createRedirect?: (path: string) => string;
}

class AuthConfigurationError extends Error {
  constructor() {
    super("Public mobile authentication configuration is unavailable.");
    this.name = "AuthConfigurationError";
  }
}

function getErrorProperty(error: unknown, property: "code" | "status") {
  if (!error || typeof error !== "object" || !(property in error)) {
    return undefined;
  }

  return (error as Record<string, unknown>)[property];
}

function failureFromError(error: unknown, fallback: AuthFailure): AuthFailure {
  if (error instanceof AuthConfigurationError) {
    return "configuration";
  }
  if (getErrorProperty(error, "status") === 429) {
    return "rate-limited";
  }

  const code = getErrorProperty(error, "code");
  if (
    code === "invalid_credentials" ||
    code === "email_not_confirmed" ||
    code === "user_not_found"
  ) {
    return "credentials";
  }

  return fallback;
}

function exactMobileCallback(
  path: "entrar" | "redefinir-senha",
  createRedirect: (path: string) => string,
): string {
  let callback: URL;
  try {
    callback = new URL(createRedirect(path));
  } catch {
    throw new AuthConfigurationError();
  }

  const scheme = callback.protocol.replace(/:$/, "");
  const logicalPath =
    callback.pathname === "" || callback.pathname === "/"
      ? callback.hostname
      : callback.pathname.replace(/^\//, "");
  const isDayGymScheme =
    scheme === "daygym" ||
    scheme === "daygym-development" ||
    scheme === "daygym-preview";

  if (
    !isDayGymScheme ||
    logicalPath !== path ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash
  ) {
    throw new AuthConfigurationError();
  }

  return callback.toString();
}

async function isEligible(client: MobileAuthClient): Promise<boolean> {
  const [profile, consents] = await Promise.all([
    client.from("profiles").select("user_id").limit(1).maybeSingle(),
    client.from("consents").select("document, document_version"),
  ]);

  if (profile.error || consents.error || !profile.data || !consents.data) {
    return false;
  }

  return Object.entries({
    privacy_notice: stagingLegalVersions.privacyNotice,
    terms_of_service: stagingLegalVersions.termsOfService,
  }).every(([document, version]) =>
    consents.data.some(
      (consent) =>
        consent.document === document && consent.document_version === version,
    ),
  );
}

export function createMobileAuthGateway(
  options: MobileAuthGatewayOptions = {},
): DisposableMobileAuthGateway {
  const createRedirect = options.createRedirect ?? Linking.createURL;
  let client = options.client;
  let runtime: MobileAuthRuntime | undefined;

  function configuredClient(): MobileAuthClient {
    try {
      if (!client) {
        runtime = createMobileAuthRuntime();
        client = runtime.client;
      }
      return client;
    } catch {
      throw new AuthConfigurationError();
    }
  }

  return {
    async dispose() {
      await runtime?.dispose();
      runtime = undefined;
      client = undefined;
    },

    async signIn(email, password) {
      try {
        const currentClient = configuredClient();
        const { data, error } = await currentClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.session) {
          return { ok: false, reason: failureFromError(error, "credentials") };
        }
        if (!(await isEligible(currentClient))) {
          await currentClient.auth.signOut({ scope: "local" });
          return { ok: false, reason: "account-incomplete" };
        }

        return { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: failureFromError(error, "unexpected") };
      }
    },

    async signUp({ email, password, isAdult }) {
      try {
        const { error } = await configuredClient().auth.signUp({
          email,
          password,
          options: {
            data: {
              daygym_account_creation: "v1",
              daygym_is_adult: isAdult,
              daygym_privacy_version: stagingLegalVersions.privacyNotice,
              daygym_terms_version: stagingLegalVersions.termsOfService,
            },
            emailRedirectTo: exactMobileCallback("entrar", createRedirect),
          },
        });

        const code = getErrorProperty(error, "code");
        if (code === "user_already_exists" || code === "email_exists") {
          return { ok: true, value: "check-email" };
        }
        if (error) {
          return { ok: false, reason: failureFromError(error, "unexpected") };
        }

        return { ok: true, value: "check-email" };
      } catch (error) {
        return { ok: false, reason: failureFromError(error, "unexpected") };
      }
    },

    async requestPasswordReset(email) {
      try {
        const { error } = await configuredClient().auth.resetPasswordForEmail(
          email,
          {
            redirectTo: exactMobileCallback("redefinir-senha", createRedirect),
          },
        );
        if (failureFromError(error, "unexpected") === "rate-limited") {
          return { ok: false, reason: "rate-limited" };
        }

        return { ok: true, value: undefined };
      } catch (error) {
        const reason = failureFromError(error, "unexpected");
        return reason === "configuration"
          ? { ok: false, reason }
          : { ok: true, value: undefined };
      }
    },

    async exchangeAuthCode(code) {
      try {
        const { error } =
          await configuredClient().auth.exchangeCodeForSession(code);
        return error
          ? { ok: false, reason: "link-invalid" }
          : { ok: true, value: undefined };
      } catch (error) {
        return {
          ok: false,
          reason: failureFromError(error, "link-invalid"),
        };
      }
    },

    async updatePasswordAndSignOut(password) {
      try {
        const currentClient = configuredClient();
        const { error } = await currentClient.auth.updateUser({ password });
        if (error) {
          return { ok: false, reason: failureFromError(error, "unexpected") };
        }

        const { error: signOutError } = await currentClient.auth.signOut({
          scope: "global",
        });
        return signOutError
          ? { ok: false, reason: "unexpected" }
          : { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: failureFromError(error, "unexpected") };
      }
    },

    async hasActiveEligibleSession() {
      try {
        const currentClient = configuredClient();
        const { data, error } = await currentClient.auth.getSession();
        if (error || !data.session) {
          return { ok: true, value: false };
        }

        return { ok: true, value: await isEligible(currentClient) };
      } catch (error) {
        return { ok: false, reason: failureFromError(error, "unexpected") };
      }
    },

    async signOut() {
      try {
        const { error } = await configuredClient().auth.signOut({
          scope: "local",
        });
        return error
          ? { ok: false, reason: "unexpected" }
          : { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: failureFromError(error, "unexpected") };
      }
    },
  };
}
