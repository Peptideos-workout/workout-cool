/** PeptideOS public origin used by the sibling SSO app (`NEXT_PUBLIC_APP_URL` on PeptideOS). */
export const DEFAULT_PEPTIDEOS_ORIGIN = "https://peptideos.us";

/** Existing PeptideOS auth page (`app/(auth)/signup`). */
export const PEPTIDEOS_SIGNUP_PATH = "/signup";

/**
 * Resolve the PeptideOS origin already paired with this app's SSO flow.
 *
 * PeptideOS stores `NEXT_PUBLIC_WORKOUT_COOL_URL` (workouts.peptideos.us).
 * Workout-cool stores `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` as that same origin.
 * Optional `NEXT_PUBLIC_PEPTIDEOS_URL` is the reverse pointer; if unset, a
 * `workouts.<apex>` app host maps to `https://<apex>`.
 */
export function peptideOsOrigin(explicitUrl?: string, appUrl?: string): string {
  const explicit = explicitUrl?.trim();
  if (explicit) {
    return new URL(explicit).origin;
  }

  const app = appUrl?.trim();
  if (app) {
    const url = new URL(app);
    if (url.hostname.startsWith("workouts.")) {
      return `${url.protocol}//${url.hostname.slice("workouts.".length)}`;
    }
  }

  return DEFAULT_PEPTIDEOS_ORIGIN;
}

function absoluteWorkoutReturnTo(returnTo: string | undefined, appUrl?: string): string | undefined {
  const dest = returnTo?.trim();
  if (!dest) {
    return undefined;
  }

  if (dest.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(dest)) {
    if (!/^https?:\/\//i.test(dest)) {
      return undefined;
    }
    try {
      const destUrl = new URL(dest);
      if (!appUrl?.trim()) {
        return destUrl.toString();
      }
      if (destUrl.origin === new URL(appUrl).origin) {
        return destUrl.toString();
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  const path = dest.startsWith("/") ? dest : `/${dest}`;
  const base = appUrl?.trim();
  if (!base) {
    return path;
  }
  return new URL(path, `${new URL(base).origin}/`).toString();
}

export function peptideOsSignupUrl(origin: string, returnTo?: string): string {
  const url = new URL(PEPTIDEOS_SIGNUP_PATH, `${origin.replace(/\/$/, "")}/`);
  const redirect = absoluteWorkoutReturnTo(returnTo);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  return url.toString();
}

export function resolvePeptideOsSignupUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  return peptideOsSignupUrl(origin, absoluteWorkoutReturnTo(returnTo, appUrl));
}
