import { describe, expect, it, vi } from "vitest";

vi.mock("expo-linking", () => ({
  createURL: (path: string) => `daygym-development://${path}`,
}));
vi.mock("./mobile-auth-client", () => ({
  createMobileAuthRuntime: vi.fn(),
}));

import { createMobileAuthGateway } from "./mobile-auth-gateway";

function createClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: "synthetic" } },
      error: null,
    }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: { access_token: "synthetic" } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          limit: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { user_id: "synthetic" }, error: null }),
          }),
        }),
      };
    }

    return {
      select: () =>
        Promise.resolve({
          data: [
            {
              document: "privacy_notice",
              document_version: "2026-08-13",
            },
            {
              document: "terms_of_service",
              document_version: "2026-08-13",
            },
          ],
          error: null,
        }),
    };
  });

  return { auth, from };
}

describe("createMobileAuthGateway", () => {
  it("uses only the exact DayGym callback and versioned eligibility metadata", async () => {
    const client = createClient();
    const gateway = createMobileAuthGateway({
      client: client as never,
      createRedirect: (path) => `daygym-preview://${path}`,
    });

    const result = await gateway.signUp({
      email: "pessoa@example.com",
      password: "senha-segura",
      isAdult: true,
    });

    expect(result).toEqual({ ok: true, value: "check-email" });
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "pessoa@example.com",
      password: "senha-segura",
      options: {
        data: {
          daygym_account_creation: "v1",
          daygym_is_adult: true,
          daygym_privacy_version: "2026-08-13",
          daygym_terms_version: "2026-08-13",
        },
        emailRedirectTo: "daygym-preview://entrar",
      },
    });
  });

  it("rejects a callback outside the app allowlist before contacting auth", async () => {
    const client = createClient();
    const gateway = createMobileAuthGateway({
      client: client as never,
      createRedirect: () => "https://attacker.example/entrar",
    });

    await expect(
      gateway.signUp({
        email: "pessoa@example.com",
        password: "senha-segura",
        isAdult: true,
      }),
    ).resolves.toEqual({ ok: false, reason: "configuration" });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("keeps existing-account signup non-enumerable", async () => {
    const client = createClient({
      signUp: vi.fn().mockResolvedValue({
        error: { code: "user_already_exists", status: 422 },
      }),
    });
    const gateway = createMobileAuthGateway({
      client: client as never,
      createRedirect: (path) => `daygym://${path}`,
    });

    await expect(
      gateway.signUp({
        email: "existente@example.com",
        password: "senha-segura",
        isAdult: true,
      }),
    ).resolves.toEqual({ ok: true, value: "check-email" });
  });

  it("removes a session when the profile is not eligible", async () => {
    const client = createClient();
    client.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        } as never;
      }
      return {
        select: () => Promise.resolve({ data: [], error: null }),
      } as never;
    });
    const gateway = createMobileAuthGateway({ client: client as never });

    await expect(
      gateway.signIn("pessoa@example.com", "senha-segura"),
    ).resolves.toEqual({ ok: false, reason: "account-incomplete" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not reveal whether a recovery address exists", async () => {
    const client = createClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({
        error: { code: "user_not_found", status: 400 },
      }),
    });
    const gateway = createMobileAuthGateway({
      client: client as never,
      createRedirect: (path) => `daygym-development://${path}`,
    });

    await expect(
      gateway.requestPasswordReset("ausente@example.com"),
    ).resolves.toEqual({ ok: true, value: undefined });
  });
});
