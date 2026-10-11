import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isBetterAuthEmailSignUpPath,
  shouldAllowBetterAuthUserCreate,
  shouldAllowOAuthNewUser
} from "./block-public-signup";

test("Better Auth email signup endpoints are public signup paths", () => {
  assert.equal(isBetterAuthEmailSignUpPath("/sign-up/email"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-up"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-in/email"), false);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-in/social"), false);
  assert.equal(isBetterAuthEmailSignUpPath("/callback/google"), false);
});

test("user.create is allowed only inside the SSO create-user path", () => {
  assert.equal(shouldAllowBetterAuthUserCreate(false), false);
  assert.equal(shouldAllowBetterAuthUserCreate(true), true);
});

test("OAuth must not create a new workout-cool user (no email-match takeover)", () => {
  assert.equal(shouldAllowOAuthNewUser(false), false);
  assert.equal(shouldAllowOAuthNewUser(true), true);
});
