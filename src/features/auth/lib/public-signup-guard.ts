import { AsyncLocalStorage } from "node:async_hooks";

const ssoSignupStore = new AsyncLocalStorage<true>();

export const PUBLIC_SIGNUP_DISABLED = "public_signup_disabled";

/**
 * Allow Better Auth `signUpEmail` only for the PeptideOS SSO create-user path.
 * Public HTTP/OAuth signup stays blocked outside this callback.
 */
export function runWithSsoSignupAllowed<T>(fn: () => T): T {
  return ssoSignupStore.run(true, fn);
}

export function isSsoSignupContext(): boolean {
  return ssoSignupStore.getStore() === true;
}

export function isPublicSignupBlocked(): boolean {
  return !isSsoSignupContext();
}

export function publicSignupDisabledBody(redirectTo: string) {
  return { error: PUBLIC_SIGNUP_DISABLED, redirectTo };
}
