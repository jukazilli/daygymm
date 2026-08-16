import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWebPublicConfig: vi.fn(() => ({
    publishableKey: "sb_publishable_test",
    siteUrl: "https://daygym.example",
    url: "https://project.supabase.co",
  })),
  getWebSupabaseClient: vi.fn(),
}));

vi.mock("./supabase-public-config", () => ({
  getWebPublicConfig: mocks.getWebPublicConfig,
}));
vi.mock("./supabase-browser", () => ({
  getWebSupabaseClient: mocks.getWebSupabaseClient,
}));

import { createWebAuthGateway } from "./auth-gateway";

function clientWithEligibility(
  profile:
    | { data: unknown; error: unknown }
    | Array<{ data: unknown; error: unknown }>,
  consents: { data: unknown; error: unknown },
) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const profileResults = Array.isArray(profile) ? profile : [profile];
  const maybeSingle = vi.fn();
  for (const result of profileResults.slice(0, -1)) {
    maybeSingle.mockResolvedValueOnce(result);
  }
  maybeSingle.mockResolvedValue(profileResults.at(-1));
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: { access_token: "synthetic" } },
        error: null,
      }),
      signOut,
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() =>
        table === "profiles"
          ? {
              limit: vi.fn(() => ({
                maybeSingle,
              })),
            }
          : Promise.resolve(consents),
      ),
    })),
    signOut,
  };
}

beforeEach(() => {
  mocks.getWebSupabaseClient.mockReset();
});

describe("createWebAuthGateway", () => {
  it("recovers a transient eligibility read during the first login", async () => {
    const client = clientWithEligibility(
      [
        { data: null, error: { status: 503 } },
        { data: { user_id: "synthetic-user" }, error: null },
      ],
      {
        data: [
          { document: "privacy_notice", document_version: "2026-08-13" },
          { document: "terms_of_service", document_version: "2026-08-13" },
        ],
        error: null,
      },
    );
    mocks.getWebSupabaseClient.mockReturnValue(client);

    await expect(
      createWebAuthGateway().signIn("pessoa@example.com", "senha-segura"),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it("does not invalidate a valid login when eligibility could not be read", async () => {
    const client = clientWithEligibility(
      { data: null, error: { status: 503 } },
      { data: [], error: null },
    );
    mocks.getWebSupabaseClient.mockReturnValue(client);

    await expect(
      createWebAuthGateway().signIn("pessoa@example.com", "senha-segura"),
    ).resolves.toEqual({ ok: false, reason: "unexpected" });
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it("signs out only when the account is verifiably incomplete", async () => {
    const client = clientWithEligibility(
      { data: null, error: null },
      { data: [], error: null },
    );
    mocks.getWebSupabaseClient.mockReturnValue(client);

    await expect(
      createWebAuthGateway().signIn("pessoa@example.com", "senha-segura"),
    ).resolves.toEqual({ ok: false, reason: "account-incomplete" });
    expect(client.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
