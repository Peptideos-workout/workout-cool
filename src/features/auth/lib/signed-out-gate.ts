import { stripLocalePrefix } from "./locale-path";
import { peptideOsOrigin, resolvePeptideOsWorkoutsSsoUrl, safeWorkoutReturnTo } from "./peptideos-signup-url";

export { stripLocalePrefix };

const EXACT_ALLOWLIST = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/manifest.json",
  "/sw.js",
  "/ads.txt"
]);

const PREFIX_ALLOWLIST = [
  "/auth/signout",
  "/api/peptideos-wc-sso",
  "/api/health",
  "/api/webhooks",
  "/api/auth",
  "/_next",
  "/static",
  "/images",
  "/logo",
  "/icons",
  "/legal"
];

function pathEqualsOrPrefixed(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

export function isSignedOutAllowlistedPath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname);
  if (EXACT_ALLOWLIST.has(path)) {
    return true;
  }
  if (PREFIX_ALLOWLIST.some((base) => pathEqualsOrPrefixed(path, base))) {
    return true;
  }
  if (path.startsWith("/apple-touch-icon") || path.startsWith("/android-chrome-")) {
    return true;
  }
  return false;
}

export function shouldRedirectSignedOutRequest(pathname: string, hasSession: boolean): boolean {
  if (hasSession) {
    return false;
  }
  return !isSignedOutAllowlistedPath(pathname);
}

export function signedOutReturnTo(returnTo: string | undefined, appUrl: string): string | undefined {
  return safeWorkoutReturnTo(returnTo, appUrl);
}

export function peptideOsSignedOutRedirectLocation(
  explicitUrl: string | undefined,
  appUrl: string | undefined,
  returnTo?: string
): string {
  return resolvePeptideOsWorkoutsSsoUrl(explicitUrl, appUrl, returnTo);
}

export function peptideOsLoginOrigin(explicitUrl?: string, appUrl?: string): string {
  return peptideOsOrigin(explicitUrl, appUrl);
}
