import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PEPTIDEOS_ORIGIN,
  PEPTIDEOS_SIGNUP_PATH,
  peptideOsOrigin,
  peptideOsSignupUrl,
  resolvePeptideOsSignupUrl
} from "./peptideos-signup-url";

test("uses PeptideOS NEXT_PUBLIC_APP_URL pairing: workouts.peptideos.us → peptideos.us", () => {
  assert.equal(peptideOsOrigin(undefined, "https://workouts.peptideos.us"), "https://peptideos.us");
  assert.equal(peptideOsOrigin(undefined, "https://workouts.peptideos.us/app"), "https://peptideos.us");
});

test("explicit NEXT_PUBLIC_PEPTIDEOS_URL wins over the workouts.* derivation", () => {
  assert.equal(
    peptideOsOrigin("https://staging.peptideos.test/app", "https://workouts.peptideos.us"),
    "https://staging.peptideos.test"
  );
});

test("falls back to the production PeptideOS origin used by the SSO sibling app", () => {
  assert.equal(peptideOsOrigin(undefined, "http://localhost:3000"), DEFAULT_PEPTIDEOS_ORIGIN);
  assert.equal(peptideOsOrigin(undefined, undefined), DEFAULT_PEPTIDEOS_ORIGIN);
});

test("signup URL is PeptideOS /signup (the existing PeptideOS auth page)", () => {
  assert.equal(PEPTIDEOS_SIGNUP_PATH, "/signup");
  assert.equal(peptideOsSignupUrl("https://peptideos.us"), "https://peptideos.us/signup");
  assert.equal(resolvePeptideOsSignupUrl(undefined, "https://workouts.peptideos.us"), "https://peptideos.us/signup");
});
