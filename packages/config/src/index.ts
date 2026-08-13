export interface PublicSupabaseEnvironment {
  readonly url: string | undefined;
  readonly publishableKey: string | undefined;
}

export interface PublicSupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9._-]{16,}$/;

function validateUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Public Supabase configuration has an invalid URL.");
  }

  const isLoopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const hasSafeProtocol =
    parsed.protocol === "https:" || (isLoopback && parsed.protocol === "http:");
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasUnexpectedParts =
    parsed.pathname !== "/" || Boolean(parsed.search || parsed.hash);

  if (!hasSafeProtocol || hasCredentials || hasUnexpectedParts) {
    throw new Error("Public Supabase configuration has an unsafe URL.");
  }

  return parsed.origin;
}

export function parsePublicSupabaseConfig(
  environment: PublicSupabaseEnvironment,
): PublicSupabaseConfig {
  const rawUrl = environment.url;
  const rawPublishableKey = environment.publishableKey;
  const missingFields = [
    rawUrl ? undefined : "URL",
    rawPublishableKey ? undefined : "publishable key",
  ].filter((field): field is string => field !== undefined);

  if (!rawUrl || !rawPublishableKey) {
    throw new Error(
      `Public Supabase configuration is missing: ${missingFields.join(", ")}.`,
    );
  }

  const url = validateUrl(rawUrl);
  const publishableKey = rawPublishableKey.trim();

  if (!publishableKeyPattern.test(publishableKey)) {
    throw new Error(
      "Public Supabase configuration requires an sb_publishable key.",
    );
  }

  return Object.freeze({ url, publishableKey });
}
