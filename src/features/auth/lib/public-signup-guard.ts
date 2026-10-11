export const PUBLIC_SIGNUP_DISABLED = "public_signup_disabled";

/**
 * Public workout-cool signup is closed.
 * PeptideOS SSO create-user calls `auth.api.signUpEmail` in-process and never
 * hits `/api/auth/*` or `signUpAction`.
 */
export function isPublicSignupBlocked(): boolean {
  return true;
}

export function publicSignupDisabledBody(redirectTo: string) {
  return { error: PUBLIC_SIGNUP_DISABLED, redirectTo };
}

/** Always the same payload — never include email or whether a user exists. */
export function passwordResetDisabledBody(redirectTo: string) {
  return { ok: true as const, redirectTo };
}
