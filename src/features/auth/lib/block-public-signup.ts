const BETTER_AUTH_HTTP_PREFIX = "/api/auth";

function stripQueryAndHash(path: string): string {
  return path.split("?")[0].split("#")[0];
}

function resolveDotSegments(path: string): string {
  const absolute = path.startsWith("/");
  const stack: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const joined = stack.join("/");
  return absolute ? `/${joined}` : joined;
}

export const BETTER_AUTH_PATH_DECODE_ROUNDS = 8;

function loopDecodePath(value: string): string | null {
  let current = value;
  for (let i = 0; i < BETTER_AUTH_PATH_DECODE_ROUNDS; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) {
      return current;
    }
    current = next;
  }
  return null;
}

/** True when loop-decode is unstable after the cap or `decodeURIComponent` throws. */
export function isUndecodableBetterAuthPath(pathname: string): boolean {
  return loopDecodePath(stripQueryAndHash(pathname).trim().toLowerCase()) === null;
}

export function normalizeBetterAuthPath(path: string): string {
  const decoded = loopDecodePath(stripQueryAndHash(path).trim().toLowerCase());
  if (decoded === null) {
    return "/";
  }
  let normalized = decoded.replace(/\/+/g, "/");
  normalized = resolveDotSegments(normalized);
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || "/";
}

function canonicalizeSignupPath(path: string): string {
  const normalized = normalizeBetterAuthPath(path);
  if (normalized === "/admin/createuser" || normalized === "/admin/create-user") {
    return "/admin/create-user";
  }
  if (normalized === "/admin/setuserpassword" || normalized === "/admin/set-user-password") {
    return "/admin/set-user-password";
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
  return isUndecodableBetterAuthPath(pathname) || isBetterAuthEmailSignUpPath(betterAuthRequestPath(pathname));
}

/** Better Auth HTTP paths that start email/password or social sign-in. */
export function isBetterAuthEmailSignInPath(path: string): boolean {
  return pathEqualsOrPrefixed(canonicalizeSignupPath(path), "/sign-in");
}

/** Better Auth OAuth callback (Google). */
export function isBetterAuthOAuthCallbackPath(path: string): boolean {
  return pathEqualsOrPrefixed(canonicalizeSignupPath(path), "/callback");
}

export function isBetterAuthVerifyEmailPath(path: string): boolean {
  return pathEqualsOrPrefixed(canonicalizeSignupPath(path), "/verify-email");
}

export function isPublicBetterAuthSigninRequest(pathname: string): boolean {
  if (isUndecodableBetterAuthPath(pathname)) {
    return true;
  }
  const path = betterAuthRequestPath(pathname);
  return isBetterAuthEmailSignInPath(path) || isBetterAuthOAuthCallbackPath(path) || isBetterAuthVerifyEmailPath(path);
}

function pathEqualsOrPrefixed(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Better Auth HTTP paths that send a reset email or write a new credential password. */
export function isBetterAuthPasswordResetRequest(pathname: string): boolean {
  if (isUndecodableBetterAuthPath(pathname)) {
    return true;
  }
  const path = betterAuthRequestPath(pathname);
  return (
    pathEqualsOrPrefixed(path, "/forget-password") ||
    pathEqualsOrPrefixed(path, "/forgot-password") ||
    pathEqualsOrPrefixed(path, "/request-password-reset") ||
    pathEqualsOrPrefixed(path, "/reset-password") ||
    pathEqualsOrPrefixed(path, "/admin/set-user-password")
  );
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

/** A `credential` account row is only created by in-process SSO `signUpEmail`. */
export function shouldAllowCredentialAccountCreate(providerId: string, isSsoContext: boolean): boolean {
  return providerId !== "credential" || isSsoContext;
}
