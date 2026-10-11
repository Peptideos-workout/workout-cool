import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PEPTIDEOS_ORIGIN,
  PEPTIDEOS_LOGIN_PATH,
  PEPTIDEOS_SETTINGS_PASSWORD_HASH,
  PEPTIDEOS_SETTINGS_PATH,
  PEPTIDEOS_SIGNUP_PATH,
  PEPTIDEOS_WORKOUTS_SIGNOUT_PATH,
  PEPTIDEOS_WORKOUTS_SSO_PATH,
  peptideOsForgotPasswordUrl,
  peptideOsLoginUrl,
  peptideOsOrigin,
  peptideOsSettingsUrl,
  peptideOsSignupUrl,
  peptideOsWorkoutsSignoutUrl,
  peptideOsWorkoutsSsoUrl,
  resolvePeptideOsForgotPasswordUrl,
  resolvePeptideOsLoginUrl,
  resolvePeptideOsSettingsUrl,
  resolvePeptideOsSignupUrl,
  resolvePeptideOsWorkoutsSignoutUrl,
  planWorkoutSso,
  resolvePeptideOsWorkoutsSsoUrl,
  safeWorkoutReturnTo,
  ssoFinalizeLocation
} from "./peptideos-signup-url";

const APP = "https://workouts.peptideos.us";
const ORIGIN = "https://peptideos.us";

test("uses PeptideOS NEXT_PUBLIC_APP_URL pairing: workouts.peptideos.us → peptideos.us", () => {
  assert.equal(peptideOsOrigin(undefined, APP), ORIGIN);
  assert.equal(peptideOsOrigin(undefined, `${APP}/app`), ORIGIN);
});

test("explicit NEXT_PUBLIC_PEPTIDEOS_URL wins over the workouts.* derivation", () => {
  assert.equal(peptideOsOrigin("https://staging.peptideos.test/app", APP), "https://staging.peptideos.test");
});

test("falls back to the production PeptideOS origin used by the SSO sibling app", () => {
  assert.equal(peptideOsOrigin(undefined, "http://localhost:3000"), DEFAULT_PEPTIDEOS_ORIGIN);
  assert.equal(peptideOsOrigin(undefined, undefined), DEFAULT_PEPTIDEOS_ORIGIN);
});

function signupNext(returnTo?: string): string {
  const sso = new URL("/api/workouts/sso", `${ORIGIN}/`);
  if (returnTo) {
    sso.searchParams.set("redirect", returnTo);
  }
  return `${ORIGIN}/signup?next=${encodeURIComponent(`${sso.pathname}${sso.search}`)}`;
}

test("login URL is the PeptideOS SSO entry (PeptideOS /login ignores ?redirect=)", () => {
  assert.equal(PEPTIDEOS_LOGIN_PATH, "/login");
  assert.equal(peptideOsLoginUrl(ORIGIN, APP), `${ORIGIN}/api/workouts/sso`);
  assert.equal(resolvePeptideOsLoginUrl(undefined, APP), `${ORIGIN}/api/workouts/sso`);
  assert.equal(
    resolvePeptideOsLoginUrl(undefined, APP, "/en/tools"),
    `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/tools`)}`
  );
  assert.equal(peptideOsLoginUrl(ORIGIN, APP, "https://evil.example/phish"), `${ORIGIN}/api/workouts/sso`);
  assert.equal(peptideOsLoginUrl(ORIGIN, APP, "/en/%5cevil"), `${ORIGIN}/api/workouts/sso`);
});

test("signup URL uses next=/api/workouts/sso?redirect= so PeptideOS returns through SSO", () => {
  assert.equal(PEPTIDEOS_SIGNUP_PATH, "/signup");
  assert.equal(peptideOsSignupUrl(ORIGIN, APP), signupNext());
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP), signupNext());
});

test("preserves a workout-cool return path on signup as next=/api/workouts/sso?redirect=", () => {
  assert.equal(
    resolvePeptideOsSignupUrl(undefined, APP, "/en/programs/strength"),
    signupNext(`${APP}/en/programs/strength`)
  );
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, `${APP}/profile`), signupNext(`${APP}/profile`));
});

test("drops off-origin and protocol-relative return URLs", () => {
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP, "https://evil.example/phish"), signupNext());
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP, "//evil.example/phish"), signupNext());
});

test("requires parsed return origin to match appUrl origin", () => {
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://evil.example/phish"), signupNext());
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://workouts.peptideos.us.evil.example/"), signupNext());
});

test("rejects backslash and encoded %5c variants in the return URL", () => {
  const rejected = [
    "/en\\evil.example",
    "/en/%5cevil.example",
    "/en/%5Cevil.example",
    "/%5Cevil.example",
    `${APP}/%5cevil`,
    `${APP}\\@evil.example`,
    "/en/programs%5c..",
    "/en/programs%5C..",
    "/en/%25255c",
    "/en/%2525c",
    `${APP}/%25255cevil`
  ];
  for (const returnTo of rejected) {
    assert.equal(peptideOsSignupUrl(ORIGIN, APP, returnTo), signupNext(), returnTo);
    assert.equal(resolvePeptideOsSignupUrl(undefined, APP, returnTo), signupNext(), returnTo);
  }
});

function encodeTimes(value: string, times: number): string {
  let encoded = value;
  for (let i = 0; i < times; i++) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

test("drops return URLs that stay encoded after 8 decode rounds or are malformed", () => {
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, `/en/programs${encodeTimes("/", 8)}strength`), signupNext());
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "/en/programs/%"), signupNext());
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "/en/programs/%ZZ"), signupNext());
  assert.equal(
    resolvePeptideOsSignupUrl(undefined, APP, "/en/programs/strength"),
    signupNext(`${APP}/en/programs/strength`)
  );
});

test("rejects return URLs that carry userinfo", () => {
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://evil@workouts.peptideos.us/phish"), signupNext());
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://user:pass@workouts.peptideos.us/profile"), signupNext());
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://workouts.peptideos.us@evil.example/"), signupNext());
});

test("PeptideOS workouts SSO URL is the existing /api/workouts/sso launcher", () => {
  assert.equal(PEPTIDEOS_WORKOUTS_SSO_PATH, "/api/workouts/sso");
  assert.equal(peptideOsWorkoutsSsoUrl(ORIGIN, APP), `${ORIGIN}/api/workouts/sso`);
  assert.equal(
    resolvePeptideOsWorkoutsSsoUrl(undefined, APP, "/en/profile"),
    `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/profile`)}`
  );
});

test("drops malicious return URLs from the PeptideOS workouts SSO launcher", () => {
  assert.equal(peptideOsWorkoutsSsoUrl(ORIGIN, APP, "https://evil.example/phish"), `${ORIGIN}/api/workouts/sso`);
  assert.equal(peptideOsWorkoutsSsoUrl(ORIGIN, APP, "//evil.example/phish"), `${ORIGIN}/api/workouts/sso`);
  assert.equal(peptideOsWorkoutsSsoUrl(ORIGIN, APP, "/en/%5cevil"), `${ORIGIN}/api/workouts/sso`);
});

test("PeptideOS forgot-password URL uses the same origin pairing", () => {
  assert.equal(peptideOsForgotPasswordUrl(ORIGIN), `${ORIGIN}/forgot-password`);
  assert.equal(resolvePeptideOsForgotPasswordUrl(undefined, APP), `${ORIGIN}/forgot-password`);
});

test("PeptideOS settings URL points at /settings#password and keeps a safe return", () => {
  assert.equal(PEPTIDEOS_SETTINGS_PATH, "/settings");
  assert.equal(PEPTIDEOS_SETTINGS_PASSWORD_HASH, "password");
  assert.equal(peptideOsSettingsUrl(ORIGIN, APP), `${ORIGIN}/settings#password`);
  assert.equal(
    resolvePeptideOsSettingsUrl(undefined, APP, "/profile"),
    `${ORIGIN}/settings?redirect=${encodeURIComponent(`${APP}/profile`)}#password`
  );
});

test("drops unsafe PeptideOS settings return URLs", () => {
  assert.equal(peptideOsSettingsUrl(ORIGIN, APP, "https://evil.example/phish"), `${ORIGIN}/settings#password`);
  assert.equal(peptideOsSettingsUrl(ORIGIN, APP, "//evil.example/phish"), `${ORIGIN}/settings#password`);
  assert.equal(peptideOsSettingsUrl(ORIGIN, APP, "/en/%5cevil"), `${ORIGIN}/settings#password`);
});

test("rejects control characters in the return URL", () => {
  assert.equal(safeWorkoutReturnTo(`${APP}/en/profile\u0000`, APP), undefined);
  assert.equal(safeWorkoutReturnTo("/en/profile\u0007", APP), undefined);
  assert.equal(safeWorkoutReturnTo(`${APP}/en/profile\u001f`, APP), undefined);
  assert.equal(safeWorkoutReturnTo(`${APP}/en/profile\u007f`, APP), undefined);
  assert.equal(safeWorkoutReturnTo("/en/profile?tab=ok", APP), `${APP}/en/profile?tab=ok`);
});

test("SSO finalize honours only same-origin WC redirects and fails closed to the WC origin home", () => {
  assert.equal(ssoFinalizeLocation(APP, `${APP}/en/profile?tab=history`), `${APP}/en/profile?tab=history`);
  assert.equal(ssoFinalizeLocation(APP, "/en/programs/strength"), `${APP}/en/programs/strength`);
  assert.equal(ssoFinalizeLocation(APP, undefined), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, "https://evil.example/phish"), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, "//evil.example/phish"), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, "/en/%5cevil"), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, "https://evil@workouts.peptideos.us/phish"), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, `${APP}/en/profile\u0000`), `${APP}/`);
});

test("planWorkoutSso and ssoFinalizeLocation deny leftover WC auth pages and fall back to /", () => {
  const denied = [
    "/auth/signout",
    "/auth/signin",
    "/auth/signup",
    "/en/auth/signout",
    "/fr/auth/signin",
    "/zh-CN/auth/signup/",
    `${APP}/auth/signout`,
    `${APP}/en/auth/signin`,
    `${APP}/zh-cn/auth/signup`
  ];
  for (const returnTo of denied) {
    assert.equal(ssoFinalizeLocation(APP, returnTo), `${APP}/`, returnTo);
    assert.equal(planWorkoutSso(ORIGIN, APP, returnTo), `${ORIGIN}/api/workouts/sso`, returnTo);
    assert.equal(peptideOsWorkoutsSsoUrl(ORIGIN, APP, returnTo), `${ORIGIN}/api/workouts/sso`, returnTo);
    assert.equal(peptideOsLoginUrl(ORIGIN, APP, returnTo), `${ORIGIN}/api/workouts/sso`, returnTo);
    assert.equal(peptideOsSignupUrl(ORIGIN, APP, returnTo), signupNext(), returnTo);
  }
  assert.equal(planWorkoutSso(ORIGIN, APP, "/en/profile"), `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/profile`)}`);
  assert.equal(ssoFinalizeLocation(APP, "/en/profile"), `${APP}/en/profile`);
});

test("PeptideOS workouts sign-out URL redirects back to public WC home", () => {
  assert.equal(PEPTIDEOS_WORKOUTS_SIGNOUT_PATH, "/api/workouts/signout");
  assert.equal(
    peptideOsWorkoutsSignoutUrl(ORIGIN, APP),
    `${ORIGIN}/api/workouts/signout?redirect=${encodeURIComponent(`${APP}/`)}`
  );
  assert.equal(
    resolvePeptideOsWorkoutsSignoutUrl(undefined, APP),
    `${ORIGIN}/api/workouts/signout?redirect=${encodeURIComponent(`${APP}/`)}`
  );
});
