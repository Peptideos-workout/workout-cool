import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isSignedOutAllowlistedPath,
  peptideOsSignedOutRedirectLocation,
  shouldRedirectSignedOutRequest,
  signedOutReturnTo
} from "./signed-out-gate";

const APP = "https://workouts.peptideos.us";
const ORIGIN = "https://peptideos.us";

test("signed-out visitors are redirected for app pages", () => {
  for (const path of [
    "/",
    "/en",
    "/en/profile",
    "/fr/programs",
    "/tools",
    "/about",
    "/auth/signin",
    "/en/auth/signup",
    "/zh-cn/auth/signin",
    "/zh-CN/auth/signup"
  ]) {
    assert.equal(shouldRedirectSignedOutRequest(path, false), true, path);
  }
});

test("allowlisted signed-out paths pass through", () => {
  const allowlisted = [
    "/auth/signout",
    "/en/auth/signout",
    "/fr/auth/signout/",
    "/api/peptideos-wc-sso",
    "/api/peptideos-wc-sso/link",
    "/api/health",
    "/api/webhooks/stripe",
    "/api/webhooks/revenuecat",
    "/api/auth/get-session",
    "/api/auth/sign-out",
    "/_next/static/chunk.js",
    "/static/file.css",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
    "/manifest.json",
    "/images/logo.png",
    "/logo/mark.svg",
    "/icons/icon.png",
    "/legal/privacy",
    "/en/legal/terms",
    "/zh-CN/legal/sales-terms",
    "/zh-cn/legal/privacy",
    "/zh-cn/auth/signout"
  ];
  for (const path of allowlisted) {
    assert.equal(isSignedOutAllowlistedPath(path), true, path);
    assert.equal(shouldRedirectSignedOutRequest(path, false), false, path);
  }
});

test("does not allowlist the deferred PeptideOS account-link page", () => {
  assert.equal(isSignedOutAllowlistedPath("/auth/link-peptideos"), false);
  assert.equal(isSignedOutAllowlistedPath("/en/auth/link-peptideos"), false);
  assert.equal(shouldRedirectSignedOutRequest("/auth/link-peptideos", false), true);
});

test("signed-in users are not redirected to PeptideOS", () => {
  for (const path of ["/", "/en/profile", "/auth/signin", "/en/programs", "/auth/link-peptideos"]) {
    assert.equal(shouldRedirectSignedOutRequest(path, true), false, path);
  }
});

test("signed-out redirect targets PeptideOS /api/workouts/sso with a safe same-origin return", () => {
  assert.equal(
    peptideOsSignedOutRedirectLocation(undefined, APP, "/en/programs/strength"),
    `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/programs/strength`)}`
  );
  assert.equal(peptideOsSignedOutRedirectLocation(undefined, APP), `${ORIGIN}/api/workouts/sso`);
});

test("malicious return URLs are dropped from the PeptideOS SSO redirect", () => {
  const rejected = [
    "https://evil.example/phish",
    "//evil.example/phish",
    "/en\\evil.example",
    "/en/%5cevil.example",
    "https://evil@workouts.peptideos.us/phish",
    "https://workouts.peptideos.us.evil.example/"
  ];
  for (const returnTo of rejected) {
    assert.equal(peptideOsSignedOutRedirectLocation(undefined, APP, returnTo), `${ORIGIN}/api/workouts/sso`, returnTo);
  }
});

test("signed-out return helper keeps only same-origin workout-cool URLs", () => {
  assert.equal(signedOutReturnTo("/en/profile?tab=history", APP), `${APP}/en/profile?tab=history`);
  assert.equal(signedOutReturnTo("https://evil.example/phish", APP), undefined);
  assert.equal(signedOutReturnTo("/en/%5cevil", APP), undefined);
});
