export const stagingLegalVersions = Object.freeze({
  privacyNotice: "2026-08-13",
  termsOfService: "2026-08-13",
});

export type AuthFailure =
  | "account-incomplete"
  | "configuration"
  | "credentials"
  | "link-invalid"
  | "rate-limited"
  | "unexpected";

export type AuthResult<T = undefined> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: AuthFailure };

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
  readonly isAdult: true;
}

export type AuthEmailLinkPurpose = "confirmation" | "recovery";

export interface AuthGateway {
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult<"check-email">>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  exchangeAuthCode(code: string): Promise<AuthResult>;
  verifyEmailToken(
    tokenHash: string,
    purpose: AuthEmailLinkPurpose,
  ): Promise<AuthResult>;
  updatePasswordAndSignOut(password: string): Promise<AuthResult>;
  hasActiveEligibleSession(): Promise<AuthResult<boolean>>;
  signOut(): Promise<AuthResult>;
}
