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
  peptideOsSignoutFinalizeLocation,
  peptideOsSignupUrl,
  peptideOsWorkoutsSignoutActionUrl,
  peptideOsWorkoutsSignoutHomeRedirect,
  peptideOsWorkoutsSignoutUrl,
  peptideOsWorkoutsSsoUrl,
  resolvePeptideOsForgotPasswordUrl,
  resolvePeptideOsLoginUrl,
  resolvePeptideOsSettingsUrl,
  resolvePeptideOsSignupUrl,
  resolvePeptideOsWorkoutsSignoutUrl,
  PEPTIDEOS_BROWSER_ORIGINS,
  planWorkoutSso,
  resolvePeptideOsWorkoutsSsoUrl,
  safeWorkoutReturnTo,
  ssoDashboardReturnAllowlist,
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

test("drops return URLs that stay encoded after 5 decode rounds or are malformed", () => {
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, `/en/programs${encodeTimes("/", 5)}strength`), signupNext());
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

test("ssoFinalizeLocation uses decoded form only for checks and never returns a decoded rewrite", () => {
  const home = `${APP}/`;
  const encodedSlash = [
    "/%2F%2Fevil.com",
    `${APP}/%2F%2Fevil.com`,
    "/%252F%252Fevil.com",
    `${APP}/%252F%252Fevil.com`,
    "/%25252F%25252Fevil.com",
    "/%5C%5Cevil.com",
    `${APP}/%5C%5Cevil.com`,
    "/%255c%255cevil.com",
    "/auth/signin;next=/",
    "/en/auth/signup;x",
    `${APP}/auth/signout;foo`,
    "/%2Fauth/signin;bar"
  ];

  for (const dest of encodedSlash) {
    const location = ssoFinalizeLocation(APP, dest);
    assert.equal(location, home, dest);
    assert.doesNotMatch(location, /evil\.com/, dest);
    assert.doesNotMatch(location, /\/\/\//, dest);
  }

  assert.equal(ssoFinalizeLocation(APP, "/en/profile%2Fstats"), `${APP}/en/profile%2Fstats`);
  assert.equal(ssoFinalizeLocation(APP, `${APP}/en/profile%2Fstats`), `${APP}/en/profile%2Fstats`);
  assert.equal(ssoFinalizeLocation(APP, "/en/profile;jsessionid=1"), `${APP}/en/profile;jsessionid=1`);
  assert.equal(safeWorkoutReturnTo(`${APP}/%2F%2Fevil.com`, APP), undefined);
  assert.equal(safeWorkoutReturnTo("/%2F%2Fevil.com", APP), undefined);
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

test("dashboard return allowlist is the apex URL, plus www only when that origin is already trusted", () => {
  assert.deepEqual([...PEPTIDEOS_BROWSER_ORIGINS], ["https://peptideos.us", "https://www.peptideos.us"]);
  assert.deepEqual(ssoDashboardReturnAllowlist(), ["https://peptideos.us/workouts", "https://www.peptideos.us/workouts"]);
  assert.deepEqual(ssoDashboardReturnAllowlist(PEPTIDEOS_BROWSER_ORIGINS), [
    "https://peptideos.us/workouts",
    "https://www.peptideos.us/workouts"
  ]);
  assert.deepEqual(ssoDashboardReturnAllowlist(["https://peptideos.us"]), ["https://peptideos.us/workouts"]);
  assert.deepEqual(ssoDashboardReturnAllowlist(["https://peptideos.us", "http://localhost:3000"]), ["https://peptideos.us/workouts"]);
  assert.deepEqual(ssoDashboardReturnAllowlist([]), ["https://peptideos.us/workouts"]);
});

test("ssoFinalizeLocation sends an exact dashboard return back and ignores the in-app redirect", () => {
  assert.equal(ssoFinalizeLocation(APP, "/en/profile", "https://peptideos.us/workouts"), "https://peptideos.us/workouts");
  assert.equal(
    ssoFinalizeLocation(APP, "https://evil.example/phish", "https://peptideos.us/workouts"),
    "https://peptideos.us/workouts"
  );
  assert.equal(ssoFinalizeLocation(APP, undefined, "https://www.peptideos.us/workouts"), "https://www.peptideos.us/workouts");
  assert.equal(
    ssoFinalizeLocation(APP, "/en/profile", "https://www.peptideos.us/workouts", ["https://peptideos.us"]),
    `${APP}/en/profile`
  );
});

test("ssoFinalizeLocation rejects every non-exact return and falls back to the in-app redirect", () => {
  const rejected = [
    "",
    " ",
    "https://peptideos.us/workouts ",
    " https://peptideos.us/workouts",
    "https://peptideos.us/workouts?next=1",
    "https://peptideos.us/workouts?redirect=https://evil.example",
    "https://peptideos.us/workouts#evil",
    "https://peptideos.us/workouts/",
    "https://peptideos.us/workouts/extra",
    "https://peptideos.us/workouts.evil.example",
    "https://peptideos.us/workout",
    "https://peptideos.us/Workouts",
    "HTTPS://peptideos.us/workouts",
    "http://peptideos.us/workouts",
    "https://peptideos.us:443/workouts",
    "https://evil.example/workouts",
    "https://peptideos.us.evil.test/workouts",
    "https://workouts.peptideos.us/workouts",
    "https://evil@peptideos.us/workouts",
    "https://peptideos.us/workouts@evil.com",
    "//peptideos.us/workouts",
    "https://peptideos.us//workouts",
    "/workouts",
    "workouts",
    "https://peptideos.us/workouts/../admin",
    "https://peptideos.us/workouts%2F%2Fevil.com",
    "https://peptideos.us/workouts%252F%252Fevil.com",
    "https://peptideos.us/%2F%2Fevil.com",
    "https://peptideos.us/workouts%5C%5Cevil.com",
    "https://peptideos.us\\workouts",
    "https://peptideos.us/workouts\\@evil.com",
    "https://peptideos.us/workouts\nhttps://evil.example",
    "https://peptideos.us/workouts\r\nLocation: https://evil.example",
    "https://peptideos.us/workouts\u0000",
    "https://peptideos.us/workouts\u0009",
    "https://peptideos.us/workouts\u200b",
    "https://www.peptideos.us/workouts/",
    "https://www.peptideos.us/workouts?x=1",
    "https://www.peptideos.us/workouts/extra",
    "http://www.peptideos.us/workouts",
    "https://www.peptideos.us//workouts",
    "//www.peptideos.us/workouts",
    "https://peptideos.us/workouts/https://www.peptideos.us/workouts"
  ];

  for (const returnTo of rejected) {
    assert.equal(ssoFinalizeLocation(APP, "/en/profile", returnTo), `${APP}/en/profile`, JSON.stringify(returnTo));
    assert.equal(ssoFinalizeLocation(APP, undefined, returnTo), `${APP}/`, JSON.stringify(returnTo));
    assert.equal(ssoFinalizeLocation(APP, "https://evil.example/phish", returnTo), `${APP}/`, JSON.stringify(returnTo));
  }
});

test("a missing return keeps today's in-app finalize", () => {
  assert.equal(ssoFinalizeLocation(APP, "/en/profile"), `${APP}/en/profile`);
  assert.equal(ssoFinalizeLocation(APP, "/en/profile", undefined), `${APP}/en/profile`);
  assert.equal(ssoFinalizeLocation(APP, undefined, undefined), `${APP}/`);
  assert.equal(ssoFinalizeLocation(APP, "https://evil.example/phish", undefined), `${APP}/`);
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
    `${APP}/zh-cn/auth/signup`,
    "/AUTH/SIGNOUT",
    "/Auth/SignIn",
    `${APP}/AUTH/signup`
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

test("hop B POST action is PeptideOS sign-out with redirect=WC home, never WC /auth/signout", () => {
  const hopB = `${ORIGIN}/api/workouts/signout?redirect=${encodeURIComponent(`${APP}/`)}`;
  assert.equal(peptideOsWorkoutsSignoutActionUrl(ORIGIN, APP), hopB);
  assert.equal(peptideOsWorkoutsSignoutHomeRedirect(APP), `${APP}/`);
  assert.doesNotMatch(peptideOsWorkoutsSignoutActionUrl(ORIGIN, APP), /auth\/signout/);
});

test("hop C finalize lands on PeptideOS / and never hop B or WC /auth/signout", () => {
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, undefined), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${APP}/auth/signout`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${APP}/`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/api/workouts/signout`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/auth/signout`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/AUTH/SIGNOUT`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/API/workouts/signout`), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, "https://evil.example/"), `${ORIGIN}/`);
  assert.equal(peptideOsSignoutFinalizeLocation(ORIGIN, `${ORIGIN}/settings`), `${ORIGIN}/settings`);
});
