import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isBetterAuthEmailSignUpPath,
  isPublicBetterAuthSignupRequest,
  shouldAllowBetterAuthUserCreate,
  shouldAllowOAuthNewUser
} from "./block-public-signup";

test("Better Auth email signup endpoints are public signup paths", () => {
  assert.equal(isBetterAuthEmailSignUpPath("/sign-up/email"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-up"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/admin/create-user"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-in/email"), false);
  assert.equal(isBetterAuthEmailSignUpPath("/sign-in/social"), false);
  assert.equal(isBetterAuthEmailSignUpPath("/callback/google"), false);
});

test("HTTP /api/auth/sign-up/* is a public signup request; sign-in and OAuth callback are not", () => {
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-up/email"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-up"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/admin/create-user"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-in/email"), false);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-in/social"), false);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/callback/google"), false);
});

test("normalizes signup path case, trailing slash, and admin createUser variants", () => {
  assert.equal(isPublicBetterAuthSignupRequest("/API/AUTH/SIGN-UP/EMAIL"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-up/email/"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-up/"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/admin/create-user/"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/admin/createUser"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/admin/createuser"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/admin/CreateUser"), true);
  assert.equal(isBetterAuthEmailSignUpPath("/admin/createUser"), true);
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/sign-in/email/"), false);
});

test("user.create is allowed only inside the SSO create-user path", () => {
  assert.equal(shouldAllowBetterAuthUserCreate(false), false);
  assert.equal(shouldAllowBetterAuthUserCreate(true), true);
});

test("OAuth must not create a new workout-cool user (no email-match takeover)", () => {
  assert.equal(shouldAllowOAuthNewUser(false), false);
  assert.equal(shouldAllowOAuthNewUser(true), true);
});
