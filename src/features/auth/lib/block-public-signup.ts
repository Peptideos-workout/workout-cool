/** Better Auth HTTP paths that create an email/password user. */
export function isBetterAuthEmailSignUpPath(path: string): boolean {
  return path === "/sign-up/email" || path === "/sign-up";
}

/** User rows may be created only by the PeptideOS SSO create-user path. */
export function shouldAllowBetterAuthUserCreate(isSsoContext: boolean): boolean {
  return isSsoContext;
}

/**
 * Google (or any OAuth) must not create a workout-cool user.
 * Linking by email match is account takeover (PR #1).
 */
export function shouldAllowOAuthNewUser(isSsoContext: boolean): boolean {
  return isSsoContext;
}
