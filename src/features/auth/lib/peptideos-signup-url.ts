import { stripLocalePrefix } from "./locale-path";

/** PeptideOS public origin used by the sibling SSO app (`NEXT_PUBLIC_APP_URL` on PeptideOS). */
export const DEFAULT_PEPTIDEOS_ORIGIN = "https://peptideos.us";

/** Existing PeptideOS auth page (`app/(auth)/signup`). */
export const PEPTIDEOS_SIGNUP_PATH = "/signup";

/** Existing PeptideOS auth page (`app/(auth)/login`). */
export const PEPTIDEOS_LOGIN_PATH = "/login";

/** PeptideOS password recovery page. */
export const PEPTIDEOS_FORGOT_PASSWORD_PATH = "/forgot-password";

/** PeptideOS launcher that mints a WC SSO handoff (`/api/workouts/sso` → `/login?next=/workouts` when signed out). */
export const PEPTIDEOS_WORKOUTS_SSO_PATH = "/api/workouts/sso";

/** PeptideOS sign-out that then redirects back to a workout-cool URL. */
export const PEPTIDEOS_WORKOUTS_SIGNOUT_PATH = "/api/workouts/signout";

/** PeptideOS account settings (Change Password lives on this page). */
export const PEPTIDEOS_SETTINGS_PATH = "/settings";

/** In-page password section on PeptideOS `/settings`. */
export const PEPTIDEOS_SETTINGS_PASSWORD_HASH = "password";

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

function containsControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function containsForbiddenReturnChars(value: string): boolean {
  if (containsControlChars(value) || value.includes("\\") || /%5c/i.test(value)) {
    return true;
  }
  const decoded = loopDecodeUri(value);
  // Fail closed: unstable after the decode cap, or malformed %, drop the return URL.
  if (decoded === null) {
    return true;
  }
  return containsControlChars(decoded) || decoded.includes("\\") || /%5c/i.test(decoded);
}

/** Same-origin workout-cool return URL. Fail closed (undefined) on anything unsafe. */
export function safeWorkoutReturnTo(returnTo: string | undefined, appUrl: string): string | undefined {
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

/** Leftover WC auth pages: logout confirm, removed sign-in, removed sign-up. */
const DENIED_SSO_RETURN_PATHS = ["/auth/signout", "/auth/signin", "/auth/signup"] as const;

function isDeniedSsoReturnPath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname).toLowerCase();
  return DENIED_SSO_RETURN_PATHS.some((denied) => path === denied || path.startsWith(`${denied}/`));
}

/** Same-origin WC return, minus leftover auth pages that 404 or sign the user back out. */
function plannedWorkoutReturnTo(returnTo: string | undefined, appUrl: string): string | undefined {
  const safe = safeWorkoutReturnTo(returnTo, appUrl);
  if (!safe) {
    return undefined;
  }
  if (isDeniedSsoReturnPath(new URL(safe).pathname)) {
    return undefined;
  }
  return safe;
}

/** PeptideOS `/api/workouts/sso` launcher with a sanitized WC `redirect`. */
export function planWorkoutSso(origin: string, appUrl: string, returnTo?: string): string {
  const url = new URL(PEPTIDEOS_WORKOUTS_SSO_PATH, `${origin.replace(/\/$/, "")}/`);
  const redirect = plannedWorkoutReturnTo(returnTo, appUrl);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  return url.toString();
}

function peptideOsSsoNext(appUrl: string, returnTo?: string): string {
  const sso = new URL(PEPTIDEOS_WORKOUTS_SSO_PATH, "https://peptideos.invalid/");
  const redirect = plannedWorkoutReturnTo(returnTo, appUrl);
  if (redirect) {
    sso.searchParams.set("redirect", redirect);
  }
  return `${sso.pathname}${sso.search}`;
}

function peptideOsAuthUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}

export function peptideOsSignupUrl(origin: string, appUrl: string, returnTo?: string): string {
  const url = new URL(PEPTIDEOS_SIGNUP_PATH, `${origin.replace(/\/$/, "")}/`);
  url.searchParams.set("next", peptideOsSsoNext(appUrl, returnTo));
  return url.toString();
}

export function peptideOsLoginUrl(origin: string, appUrl: string, returnTo?: string): string {
  return planWorkoutSso(origin, appUrl, returnTo);
}

export function resolvePeptideOsSignupUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsSignupUrl(origin, origin);
  }
  return peptideOsSignupUrl(origin, app, returnTo);
}

export function resolvePeptideOsLoginUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsLoginUrl(origin, origin);
  }
  return peptideOsLoginUrl(origin, app, returnTo);
}

export function peptideOsForgotPasswordUrl(origin: string): string {
  return peptideOsAuthUrl(origin, PEPTIDEOS_FORGOT_PASSWORD_PATH);
}

export function resolvePeptideOsForgotPasswordUrl(explicitUrl?: string, appUrl?: string): string {
  return peptideOsForgotPasswordUrl(peptideOsOrigin(explicitUrl, appUrl));
}

export function peptideOsSettingsUrl(origin: string, appUrl: string, returnTo?: string): string {
  const url = new URL(PEPTIDEOS_SETTINGS_PATH, `${origin.replace(/\/$/, "")}/`);
  const redirect = safeWorkoutReturnTo(returnTo, appUrl);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  url.hash = PEPTIDEOS_SETTINGS_PASSWORD_HASH;
  return url.toString();
}

export function peptideOsWorkoutsSsoUrl(origin: string, appUrl: string, returnTo?: string): string {
  return planWorkoutSso(origin, appUrl, returnTo);
}

export function resolvePeptideOsWorkoutsSsoUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsWorkoutsSsoUrl(origin, origin);
  }
  return peptideOsWorkoutsSsoUrl(origin, app, returnTo);
}

/** Honour PeptideOS `redirect` only when it is a safe same-origin WC URL. Fail closed to `${origin}/`. */
export function ssoFinalizeLocation(workoutOrigin: string, redirectParam?: string): string {
  const origin = new URL(workoutOrigin).origin;
  return plannedWorkoutReturnTo(redirectParam, origin) ?? `${origin}/`;
}

export function peptideOsWorkoutsSignoutUrl(origin: string, appUrl: string): string {
  const url = new URL(PEPTIDEOS_WORKOUTS_SIGNOUT_PATH, `${origin.replace(/\/$/, "")}/`);
  const home = peptideOsWorkoutsSignoutHomeRedirect(appUrl);
  if (home) {
    url.searchParams.set("redirect", home);
  }
  return url.toString();
}

/**
 * Hop B POST action: `https://peptideos.us/api/workouts/signout?redirect=https://workouts.peptideos.us/`.
 * Must be submitted from a page on the WC origin so PeptideOS Origin check passes.
 */
export function peptideOsWorkoutsSignoutActionUrl(origin: string, appUrl: string): string {
  return peptideOsWorkoutsSignoutUrl(origin, appUrl);
}

/** WC home PeptideOS should return to after cross-app sign-out. */
export function peptideOsWorkoutsSignoutHomeRedirect(appUrl: string): string {
  const origin = new URL(appUrl).origin;
  return safeWorkoutReturnTo("/", origin) ?? `${origin}/`;
}

export function resolvePeptideOsWorkoutsSignoutUrl(explicitUrl?: string, appUrl?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsWorkoutsSignoutUrl(origin, origin);
  }
  return peptideOsWorkoutsSignoutUrl(origin, app);
}

export function resolvePeptideOsSettingsUrl(explicitUrl?: string, appUrl?: string, returnTo?: string): string {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const app = appUrl?.trim();
  if (!app) {
    return peptideOsSettingsUrl(origin, origin);
  }
  return peptideOsSettingsUrl(origin, app, returnTo);
}

/** Leftover / looping PeptideOS paths hop C must never land on. */
const DENIED_HOP_C_RETURN_PATHS = ["/api/workouts/signout", "/auth/signout", "/auth/signin", "/auth/signup"] as const;

function isDeniedHopCReturnPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return DENIED_HOP_C_RETURN_PATHS.some((denied) => path === denied || path.startsWith(`${denied}/`));
}

/**
 * Hop C landing: honour PeptideOS `redirect` only when it is a safe same-origin PeptideOS URL
 * and not hop B / leftover auth. Fail closed to `${peptideOsOrigin}/`. Never WC `/auth/signout`.
 */
export function peptideOsSignoutFinalizeLocation(peptideOsOriginUrl: string, redirectParam?: string): string {
  const origin = new URL(peptideOsOriginUrl).origin;
  const safe = safeWorkoutReturnTo(redirectParam, origin);
  if (!safe) {
    return `${origin}/`;
  }
  if (isDeniedHopCReturnPath(new URL(safe).pathname)) {
    return `${origin}/`;
  }
  return safe;
}
