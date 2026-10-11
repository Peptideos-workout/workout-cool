import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isBetterAuthEmailSignUpPath,
  isBetterAuthPasswordResetRequest,
  isPublicBetterAuthSignupRequest,
  normalizeBetterAuthPath,
  shouldAllowBetterAuthUserCreate,
  shouldAllowCredentialAccountCreate,
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

test("credential account rows can be created only inside the SSO wrap", () => {
  assert.equal(shouldAllowCredentialAccountCreate("credential", false), false);
  assert.equal(shouldAllowCredentialAccountCreate("credential", true), true);
  assert.equal(shouldAllowCredentialAccountCreate("peptideos", false), true);
  assert.equal(shouldAllowCredentialAccountCreate("google", false), true);
});

test("Better Auth forget/reset paths are public password-reset requests", () => {
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/forget-password"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/forgot-password"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/request-password-reset"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/reset-password"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/reset-password/token-abc"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/API/AUTH/FORGET-PASSWORD/"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/sign-in/email"), false);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/sign-up/email"), false);
});

test("normalizeBetterAuthPath collapses slashes, decodes %2f, and resolves dot segments", () => {
  assert.equal(normalizeBetterAuthPath("/api/auth//sign-up//email"), "/api/auth/sign-up/email");
  assert.equal(normalizeBetterAuthPath("/api/auth/sign-up%2femail"), "/api/auth/sign-up/email");
  assert.equal(normalizeBetterAuthPath("/api/auth/sign-up%2Femail"), "/api/auth/sign-up/email");
  assert.equal(normalizeBetterAuthPath("/api/auth/foo/../sign-up/email"), "/api/auth/sign-up/email");
  assert.equal(normalizeBetterAuthPath("/api/auth/./forget-password"), "/api/auth/forget-password");
  assert.equal(isPublicBetterAuthSignupRequest("/api/auth/foo/../sign-up/email"), true);
  assert.equal(isBetterAuthPasswordResetRequest("/api/auth/bar/../forget-password"), true);
});
