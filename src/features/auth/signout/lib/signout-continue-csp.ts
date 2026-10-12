import { workoutCoolPublicOrigin } from "@/shared/lib/workout-cool-public-origin";
import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

/** Hop B auto-POST page. Locale prefixes are stripped first. */
export function isSignoutContinuePath(pathname: string): boolean {
  return stripLocalePrefix(pathname) === "/auth/signout/continue";
}

export const SIGNOUT_CONTINUE_FRAME_ANCESTORS_CSP = "frame-ancestors 'none'";

export const SIGNOUT_CONTINUE_X_FRAME_OPTIONS = "DENY";

/** Full hop B continue CSP: existing form-action plus clickjacking lockout. */
export function signoutContinueContentSecurityPolicy(peptideOsOriginUrl: string, appUrl?: string): string {
  return `${signoutContinueFormActionCsp(peptideOsOriginUrl, appUrl)}; ${SIGNOUT_CONTINUE_FRAME_ANCESTORS_CSP}`;
}

/**
 * CSP `form-action` for `/auth/signout/continue`.
 * Allows the PeptideOS POST target and the 303 back to the WC origin (`'self'` plus the configured app origin).
 */
export function signoutContinueFormActionCsp(peptideOsOriginUrl: string, appUrl?: string): string {
  const sources = new Set<string>(["'self'"]);
  try {
    sources.add(new URL(peptideOsOriginUrl).origin);
  } catch {
    // Invalid PeptideOS origin — `'self'` still lets the 303 return to WC.
  }
  sources.add(workoutCoolPublicOrigin(appUrl));
  return `form-action ${[...sources].join(" ")}`;
}
