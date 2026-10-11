import { test } from "node:test";
import assert from "node:assert/strict";

import { isPublicSignupBlocked, PUBLIC_SIGNUP_DISABLED, publicSignupDisabledBody } from "./public-signup-guard";

test("public signup surfaces are always blocked", () => {
  assert.equal(isPublicSignupBlocked(), true);
});

test("blocked signup payload points callers at PeptideOS signup", () => {
  assert.deepEqual(publicSignupDisabledBody("https://peptideos.us/signup"), {
    error: PUBLIC_SIGNUP_DISABLED,
    redirectTo: "https://peptideos.us/signup"
  });
});
