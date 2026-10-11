/** PeptideOS public origin used by the sibling SSO app (`NEXT_PUBLIC_APP_URL` on PeptideOS). */
export const DEFAULT_PEPTIDEOS_ORIGIN = "https://peptideos.us";

/** Existing PeptideOS auth page (`app/(auth)/signup`). */
export const PEPTIDEOS_SIGNUP_PATH = "/signup";

/** PeptideOS password recovery page. */
export const PEPTIDEOS_FORGOT_PASSWORD_PATH = "/forgot-password";

const MAX_URI_DECODE_ROUNDS = 8;

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

function loopDecodeUri(value: string): string | null {
  let current = value;
  for (let i = 0; i < MAX_URI_DECODE_ROUNDS; i++) {
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

function containsForbiddenReturnChars(value: string): boolean {
  if (value.includes("\\") || /%5c/i.test(value)) {
    return true;
  }
  const decoded = loopDecodeUri(value);
  if (decoded === null) {
    return true;
  }
  return decoded.includes("\\") || /%5c/i.test(decoded);
}

function absoluteWorkoutReturnTo(returnTo: string | undefined, appUrl: string): string | undefined {
  const dest = returnTo?.trim();
  const base = appUrl.trim();
  if (!dest || !base || containsForbiddenReturnChars(dest)) {
    return undefined;
  }

  const decoded = loopDecodeUri(dest);
  if (decoded === null || containsForbiddenReturnChars(decoded)) {
    return undefined;
  }

  let destUrl: URL;
  try {
    if (decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
      if (!/^https?:\/\//i.test(decoded)) {
        return undefined;
      }
      destUrl = new URL(decoded);
    } else {
      const path = decoded.startsWith("/") ? decoded : `/${decoded}`;
      destUrl = new URL(path, `${new URL(base).origin}/`);
    }
  } catch {
    return undefined;
  }

  if (destUrl.username || destUrl.password) {
    return undefined;
  }

  if (destUrl.origin !== new URL(base).origin) {
    return undefined;
  }

  return destUrl.toString();
}

function peptideOsAuthUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}

export function peptideOsSignupUrl(origin: string, appUrl: string, returnTo?: string): string {
  const url = new URL(PEPTIDEOS_SIGNUP_PATH, `${origin.replace(/\/$/, "")}/`);
  const redirect = absoluteWorkoutReturnTo(returnTo, appUrl);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  return url.toString();
}

export function resolvePeptideOsSignupUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsSignupUrl(origin, origin);
  }
  return peptideOsSignupUrl(origin, app, returnTo);
}

export function peptideOsForgotPasswordUrl(origin: string): string {
  return peptideOsAuthUrl(origin, PEPTIDEOS_FORGOT_PASSWORD_PATH);
}

export function resolvePeptideOsForgotPasswordUrl(explicitUrl?: string, appUrl?: string): string {
  return peptideOsForgotPasswordUrl(peptideOsOrigin(explicitUrl, appUrl));
}
