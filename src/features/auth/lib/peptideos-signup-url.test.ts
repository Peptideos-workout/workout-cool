import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PEPTIDEOS_ORIGIN,
  PEPTIDEOS_SIGNUP_PATH,
  peptideOsOrigin,
  peptideOsSignupUrl,
  resolvePeptideOsSignupUrl
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

test("signup URL is PeptideOS /signup (the existing PeptideOS auth page)", () => {
  assert.equal(PEPTIDEOS_SIGNUP_PATH, "/signup");
  assert.equal(peptideOsSignupUrl(ORIGIN, APP), `${ORIGIN}/signup`);
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP), `${ORIGIN}/signup`);
});

test("preserves a workout-cool return path as an absolute redirect query", () => {
  assert.equal(
    resolvePeptideOsSignupUrl(undefined, APP, "/en/programs/strength"),
    `${ORIGIN}/signup?redirect=${encodeURIComponent(`${APP}/en/programs/strength`)}`
  );
  assert.equal(
    peptideOsSignupUrl(ORIGIN, APP, `${APP}/profile`),
    `${ORIGIN}/signup?redirect=${encodeURIComponent(`${APP}/profile`)}`
  );
});

test("drops off-origin and protocol-relative return URLs", () => {
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP, "https://evil.example/phish"), `${ORIGIN}/signup`);
  assert.equal(resolvePeptideOsSignupUrl(undefined, APP, "//evil.example/phish"), `${ORIGIN}/signup`);
});

test("requires parsed return origin to match appUrl origin", () => {
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://evil.example/phish"), `${ORIGIN}/signup`);
  assert.equal(peptideOsSignupUrl(ORIGIN, APP, "https://workouts.peptideos.us.evil.example/"), `${ORIGIN}/signup`);
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
    "/en/programs%5C.."
  ];
  for (const returnTo of rejected) {
    assert.equal(peptideOsSignupUrl(ORIGIN, APP, returnTo), `${ORIGIN}/signup`, returnTo);
    assert.equal(resolvePeptideOsSignupUrl(undefined, APP, returnTo), `${ORIGIN}/signup`, returnTo);
  }
});
