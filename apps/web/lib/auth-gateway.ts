import {
  stagingLegalVersions,
  type AuthFailure,
  type AuthGateway,
} from "@daygym/contracts";

import { getWebPublicConfig } from "./supabase-public-config";
import { getWebSupabaseClient } from "./supabase-browser";

export { stagingLegalVersions } from "@daygym/contracts";
export type {
  AuthFailure,
  AuthGateway,
  AuthResult,
  SignUpInput,
} from "@daygym/contracts";

class AuthConfigurationError extends Error {
  constructor() {
    super("Public authentication configuration is unavailable.");
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

function exactCallback(siteUrl: string, path: string): string {
  const callback = new URL(path, `${siteUrl}/`);
  if (callback.origin !== siteUrl) {
    throw new AuthConfigurationError();
  }

  return callback.toString();
}

export function createWebAuthGateway(): AuthGateway {
  type WebSupabaseClient = ReturnType<typeof getWebSupabaseClient>;

  let client: WebSupabaseClient | undefined;
  let siteUrl: string | undefined;

  function configuredClient(): WebSupabaseClient {
    if (client) {
      return client;
    }

    try {
      const config = getWebPublicConfig();
      siteUrl = config.siteUrl;
      client = getWebSupabaseClient();
      return client;
    } catch {
      throw new AuthConfigurationError();
    }
  }

  async function isEligible(
    currentClient: WebSupabaseClient,
  ): Promise<boolean> {
    const [profile, consents] = await Promise.all([
      currentClient.from("profiles").select("user_id").limit(1).maybeSingle(),
      currentClient.from("consents").select("document, document_version"),
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

  return {
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
        const currentClient = configuredClient();
        if (!siteUrl) {
          throw new AuthConfigurationError();
        }

        const { error } = await currentClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              daygym_account_creation: "v1",
              daygym_is_adult: isAdult,
              daygym_privacy_version: stagingLegalVersions.privacyNotice,
              daygym_terms_version: stagingLegalVersions.termsOfService,
            },
            emailRedirectTo: exactCallback(siteUrl, "/entrar/"),
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
        const currentClient = configuredClient();
        if (!siteUrl) {
          throw new AuthConfigurationError();
        }

        const { error } = await currentClient.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: exactCallback(siteUrl, "/redefinir-senha/"),
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
