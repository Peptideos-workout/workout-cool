import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isPublicSignupBlocked,
  isSsoSignupContext,
  PUBLIC_SIGNUP_DISABLED,
  publicSignupDisabledBody,
  runWithSsoSignupAllowed
} from "./public-signup-guard";

test("public signup is blocked outside the PeptideOS SSO create-user context", () => {
  assert.equal(isSsoSignupContext(), false);
  assert.equal(isPublicSignupBlocked(), true);
});

test("SSO create-user context allows Better Auth signUpEmail without opening public signup", async () => {
  assert.equal(isPublicSignupBlocked(), true);

  const allowed = await runWithSsoSignupAllowed(async () => {
    assert.equal(isSsoSignupContext(), true);
    assert.equal(isPublicSignupBlocked(), false);
    return "ok";
  });

  assert.equal(allowed, "ok");
  assert.equal(isPublicSignupBlocked(), true);
});

test("nested SSO context does not leak after the callback settles", async () => {
  await runWithSsoSignupAllowed(async () => {
    await runWithSsoSignupAllowed(async () => {
      assert.equal(isSsoSignupContext(), true);
    });
    assert.equal(isSsoSignupContext(), true);
  });
  assert.equal(isSsoSignupContext(), false);
});

test("blocked signup payload points callers at PeptideOS signup", () => {
  assert.deepEqual(publicSignupDisabledBody("https://peptideos.us/signup"), {
    error: PUBLIC_SIGNUP_DISABLED,
    redirectTo: "https://peptideos.us/signup"
  });
});
