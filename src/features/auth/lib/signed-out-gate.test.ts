import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isPublicMarketingPath,
  isSignedOutAllowlistedPath,
  peptideOsSignedOutRedirectLocation,
  shouldRedirectSignedOutRequest,
  signedOutReturnTo
} from "./signed-out-gate";
import { peptideOsWorkoutsSignoutUrl } from "./peptideos-signup-url";

const APP = "https://workouts.peptideos.us";
const ORIGIN = "https://peptideos.us";

const PUBLIC_MARKETING_PATHS = [
  "/",
  "/en",
  "/en/",
  "/zh-cn",
  "/about",
  "/en/about",
  "/zh-CN/about/",
  "/tools",
  "/en/tools",
  "/fr/tools/bmi-calculator",
  "/zh-cn/tools/calorie-calculator",
  "/en/tools/calorie-calculator/mifflin-st-jeor-calculator",
  "/en/tools/heart-rate-zones",
  "/programs",
  "/fr/programs",
  "/en/programs/strength",
  "/zh-CN/programs/full-body",
  "/premium",
  "/en/premium",
  "/leaderboard",
  "/pt/leaderboard",
  "/legal/privacy",
  "/en/legal/terms"
];

const GATED_APP_PATHS = [
  "/profile",
  "/en/profile",
  "/zh-cn/profile",
  "/statistics",
  "/en/statistics",
  "/en/programs/strength/session/day-1",
  "/zh-CN/programs/full-body/session/week-1",
  "/onboarding",
  "/en/onboarding",
  "/sponsor/onboarding",
  "/en/sponsor/onboarding",
  "/admin",
  "/en/admin/dashboard",
  "/auth/signin",
  "/en/auth/signup",
  "/zh-cn/auth/signin",
  "/zh-CN/auth/signup",
  "/auth/verify-email",
  "/en/auth/verify-request",
  "/auth/link-peptideos",
  "/dashboard",
  "/en/dashboard"
];

test("public landing and marketing pages render signed-out (no PeptideOS redirect)", () => {
  for (const path of PUBLIC_MARKETING_PATHS) {
    assert.equal(isPublicMarketingPath(path), true, path);
    assert.equal(shouldRedirectSignedOutRequest(path, false), false, path);
  }
});

test("gated app routes redirect signed-out visitors to PeptideOS", () => {
  for (const path of GATED_APP_PATHS) {
    assert.equal(isPublicMarketingPath(path), false, path);
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
  for (const path of ["/", "/en/profile", "/auth/signin", "/en/programs", "/auth/link-peptideos", "/en/statistics"]) {
    assert.equal(shouldRedirectSignedOutRequest(path, true), false, path);
  }
});

test("signed-out redirect targets PeptideOS /api/workouts/sso with a safe same-origin return", () => {
  assert.equal(
    peptideOsSignedOutRedirectLocation(undefined, APP, "/en/programs/strength"),
    `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/programs/strength`)}`
  );
  assert.equal(
    peptideOsSignedOutRedirectLocation(undefined, APP, "/en/profile?tab=history"),
    `${ORIGIN}/api/workouts/sso?redirect=${encodeURIComponent(`${APP}/en/profile?tab=history`)}`
  );
  assert.equal(peptideOsSignedOutRedirectLocation(undefined, APP), `${ORIGIN}/api/workouts/sso`);
});

test("WC sign-out to PeptideOS does not loop: WC home stays public after PeptideOS signs out", () => {
  const location = peptideOsWorkoutsSignoutUrl(ORIGIN, APP);
  const redirect = new URL(location).searchParams.get("redirect");
  assert.equal(redirect, `${APP}/`);
  const dest = new URL(redirect ?? "https://invalid.example/");
  assert.equal(dest.origin, APP);
  assert.equal(dest.pathname, "/");
  assert.equal(isPublicMarketingPath(dest.pathname), true);
  assert.equal(shouldRedirectSignedOutRequest(dest.pathname, false), false);
  assert.equal(shouldRedirectSignedOutRequest("/en", false), false);
  assert.doesNotMatch(location, /\/api\/workouts\/sso/);
});

test("signed-out SSO planner drops leftover WC auth pages so users do not land on logout or 404", () => {
  for (const returnTo of ["/auth/signout", "/en/auth/signin", "/zh-CN/auth/signup", `${APP}/auth/signout`]) {
    assert.equal(peptideOsSignedOutRedirectLocation(undefined, APP, returnTo), `${ORIGIN}/api/workouts/sso`, returnTo);
  }
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
