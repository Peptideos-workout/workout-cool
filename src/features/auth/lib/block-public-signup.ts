const BETTER_AUTH_HTTP_PREFIX = "/api/auth";

/** Better Auth HTTP paths that create an email/password user. */
export function isBetterAuthEmailSignUpPath(path: string): boolean {
  return path === "/sign-up/email" || path === "/sign-up";
}

/** Map `/api/auth/sign-up/email` → `/sign-up/email` (Better Auth endpoint path). */
export function betterAuthRequestPath(pathname: string, prefix = BETTER_AUTH_HTTP_PREFIX): string {
  if (pathname === prefix || pathname === `${prefix}/`) {
    return "/";
  }
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }
  return pathname;
}

export function isPublicBetterAuthSignupRequest(pathname: string): boolean {
  return isBetterAuthEmailSignUpPath(betterAuthRequestPath(pathname));
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
