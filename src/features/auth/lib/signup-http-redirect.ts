import { resolvePeptideOsSignupUrl } from "./peptideos-signup-url";
import { stripLocalePrefix } from "./locale-path";

export function isWorkoutCoolSignupPath(pathname: string): boolean {
  return stripLocalePrefix(pathname) === "/auth/signup";
}

export function isWorkoutCoolSigninPath(pathname: string): boolean {
  return stripLocalePrefix(pathname) === "/auth/signin";
}

export function peptideOsSignupRedirectLocation(
  explicitUrl: string | undefined,
  appUrl: string | undefined,
  returnTo: string | undefined
): string {
  return resolvePeptideOsSignupUrl(explicitUrl, appUrl, returnTo);
}
