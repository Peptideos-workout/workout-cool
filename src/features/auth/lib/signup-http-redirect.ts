import { resolvePeptideOsSignupUrl } from "./peptideos-signup-url";

const SIGNUP_PATH = /^\/(?:(?:en|fr|es|pt|ru|zh-CN)\/)?auth\/signup\/?$/;

export function isWorkoutCoolSignupPath(pathname: string): boolean {
  return SIGNUP_PATH.test(pathname);
}

export function peptideOsSignupRedirectLocation(
  explicitUrl: string | undefined,
  appUrl: string | undefined,
  returnTo: string | undefined
): string {
  return resolvePeptideOsSignupUrl(explicitUrl, appUrl, returnTo);
}
