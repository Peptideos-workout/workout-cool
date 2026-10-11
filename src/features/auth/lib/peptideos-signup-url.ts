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

export function peptideOsSignupUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${PEPTIDEOS_SIGNUP_PATH}`;
}

export function resolvePeptideOsSignupUrl(explicitUrl?: string, appUrl?: string): string {
  return peptideOsSignupUrl(peptideOsOrigin(explicitUrl, appUrl));
}
