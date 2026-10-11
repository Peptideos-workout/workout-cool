import { test } from "node:test";
import assert from "node:assert/strict";

import { isPublicSignupBlocked, passwordResetDisabledBody, PUBLIC_SIGNUP_DISABLED, publicSignupDisabledBody } from "./public-signup-guard";

test("public signup surfaces are always blocked", () => {
  assert.equal(isPublicSignupBlocked(), true);
});

test("blocked signup payload points callers at PeptideOS signup", () => {
  assert.deepEqual(publicSignupDisabledBody("https://peptideos.us/signup"), {
    error: PUBLIC_SIGNUP_DISABLED,
    redirectTo: "https://peptideos.us/signup"
  });
});

test("password-reset disabled payload is a generic 200 body that does not leak account existence", () => {
  const body = passwordResetDisabledBody("https://peptideos.us/forgot-password");
  assert.deepEqual(body, { ok: true, redirectTo: "https://peptideos.us/forgot-password" });
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /email|exists|not found|user/i);
});
