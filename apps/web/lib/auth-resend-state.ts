import { z } from "zod";

const signUpResendStateKey = "daygym:sign-up-resend:v1";

export const SIGN_UP_RESEND_COOLDOWN_SECONDS = 80;

const pendingSignUpResendSchema = z
  .object({
    deliveryUncertain: z.boolean(),
    email: z.string().trim().email().max(320),
    resendAvailableAt: z.number().int().positive(),
  })
  .strict();

export type PendingSignUpResend = z.infer<typeof pendingSignUpResendSchema>;

interface AuthResendStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function browserStorage(): AuthResendStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearPendingSignUpResend(
  storage: AuthResendStorage | null = browserStorage(),
) {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(signUpResendStateKey);
  } catch {
    // The hosted Supabase limit remains authoritative if cleanup is unavailable.
  }
}

export function readPendingSignUpResend(
  now = Date.now(),
  storage: AuthResendStorage | null = browserStorage(),
): PendingSignUpResend | null {
  if (!storage) {
    return null;
  }
  try {
    const parsed = pendingSignUpResendSchema.safeParse(
      JSON.parse(storage.getItem(signUpResendStateKey) ?? "null"),
    );
    const maximumAvailableAt = now + SIGN_UP_RESEND_COOLDOWN_SECONDS * 1_000;
    if (
      !parsed.success ||
      parsed.data.resendAvailableAt <= now ||
      parsed.data.resendAvailableAt > maximumAvailableAt
    ) {
      clearPendingSignUpResend(storage);
      return null;
    }
    return parsed.data;
  } catch {
    clearPendingSignUpResend(storage);
    return null;
  }
}

export function savePendingSignUpResend(
  state: PendingSignUpResend,
  now = Date.now(),
  storage: AuthResendStorage | null = browserStorage(),
) {
  if (!storage) {
    return;
  }
  const parsed = pendingSignUpResendSchema.safeParse(state);
  const maximumAvailableAt = now + SIGN_UP_RESEND_COOLDOWN_SECONDS * 1_000;
  if (
    !parsed.success ||
    parsed.data.resendAvailableAt <= now ||
    parsed.data.resendAvailableAt > maximumAvailableAt
  ) {
    clearPendingSignUpResend(storage);
    return;
  }

  try {
    storage.setItem(signUpResendStateKey, JSON.stringify(parsed.data));
  } catch {
    // The countdown remains available in memory when browser storage is blocked.
  }
}
