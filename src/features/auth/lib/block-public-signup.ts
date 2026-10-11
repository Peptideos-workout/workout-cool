const BETTER_AUTH_HTTP_PREFIX = "/api/auth";

function stripQueryAndHash(path: string): string {
  return path.split("?")[0].split("#")[0];
}

export function normalizeBetterAuthPath(path: string): string {
  let normalized = stripQueryAndHash(path).trim().toLowerCase();
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function canonicalizeSignupPath(path: string): string {
  const normalized = normalizeBetterAuthPath(path);
  if (normalized === "/admin/createuser" || normalized === "/admin/create-user") {
    return "/admin/create-user";
  }
  return normalized;
}

/** Better Auth HTTP paths that create an email/password user. */
export function isBetterAuthEmailSignUpPath(path: string): boolean {
  const normalized = canonicalizeSignupPath(path);
  return normalized === "/sign-up/email" || normalized === "/sign-up" || normalized === "/admin/create-user";
}

/** Map `/api/auth/sign-up/email` → `/sign-up/email` (Better Auth endpoint path). */
export function betterAuthRequestPath(pathname: string, prefix = BETTER_AUTH_HTTP_PREFIX): string {
  const normalizedPrefix = normalizeBetterAuthPath(prefix);
  const normalizedPath = normalizeBetterAuthPath(pathname);
  if (normalizedPath === normalizedPrefix) {
    return "/";
  }
  if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return canonicalizeSignupPath(normalizedPath.slice(normalizedPrefix.length));
  }
  return canonicalizeSignupPath(normalizedPath);
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
