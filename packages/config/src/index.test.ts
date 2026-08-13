import { describe, expect, it } from "vitest";

import { parsePublicSupabaseConfig, parsePublicWebConfig } from "./index";

const publishableKey = `sb_publishable_${"a".repeat(24)}`;

describe("parsePublicSupabaseConfig", () => {
  it("accepts hosted HTTPS configuration", () => {
    expect(
      parsePublicSupabaseConfig({
        url: "https://daygym-staging.supabase.co/",
        publishableKey,
      }),
    ).toEqual({
      url: "https://daygym-staging.supabase.co",
      publishableKey,
    });
  });

  it("accepts loopback HTTP for isolated development", () => {
    expect(
      parsePublicSupabaseConfig({
        url: "http://127.0.0.1:54321",
        publishableKey,
      }).url,
    ).toBe("http://127.0.0.1:54321");
  });

  it("reports missing field names without values", () => {
    expect(() =>
      parsePublicSupabaseConfig({ url: undefined, publishableKey: undefined }),
    ).toThrow("URL, publishable key");
  });

  it("rejects malformed URLs", () => {
    expect(() =>
      parsePublicSupabaseConfig({ url: "not-a-url", publishableKey }),
    ).toThrow("invalid URL");
  });

  it("rejects insecure remote URLs", () => {
    expect(() =>
      parsePublicSupabaseConfig({
        url: "http://daygym-staging.supabase.co",
        publishableKey,
      }),
    ).toThrow("unsafe URL");
  });

  it("rejects URLs containing credentials or paths", () => {
    expect(() =>
      parsePublicSupabaseConfig({
        url: "https://user:password@daygym.supabase.co/rest/v1",
        publishableKey,
      }),
    ).toThrow("unsafe URL");
  });

  it("rejects privileged Supabase keys", () => {
    const privilegedValue = `sb_${"secret"}_${"a".repeat(24)}`;

    expect(() =>
      parsePublicSupabaseConfig({
        url: "https://daygym-staging.supabase.co",
        publishableKey: privilegedValue,
      }),
    ).toThrow("sb_publishable key");
  });

  it("does not include a rejected key in the error", () => {
    const rejectedValue = "not-a-public-key-value";

    expect(() =>
      parsePublicSupabaseConfig({
        url: "https://daygym-staging.supabase.co",
        publishableKey: rejectedValue,
      }),
    ).toThrowError(
      expect.not.objectContaining({
        message: expect.stringContaining(rejectedValue),
      }),
    );
  });
});

describe("parsePublicWebConfig", () => {
  it("accepts an exact HTTPS site origin", () => {
    expect(
      parsePublicWebConfig({
        siteUrl: "https://daygym-web-staging.pages.dev/",
        url: "https://daygym-staging.supabase.co",
        publishableKey,
      }),
    ).toEqual({
      siteUrl: "https://daygym-web-staging.pages.dev",
      url: "https://daygym-staging.supabase.co",
      publishableKey,
    });
  });

  it("rejects a site URL containing a redirect path", () => {
    expect(() =>
      parsePublicWebConfig({
        siteUrl: "https://daygym-web-staging.pages.dev/redirect",
        url: "https://daygym-staging.supabase.co",
        publishableKey,
      }),
    ).toThrow("unsafe URL");
  });

  it("reports a missing site URL without exposing another value", () => {
    expect(() =>
      parsePublicWebConfig({
        siteUrl: undefined,
        url: "https://daygym-staging.supabase.co",
        publishableKey,
      }),
    ).toThrow("site URL");
  });
});
