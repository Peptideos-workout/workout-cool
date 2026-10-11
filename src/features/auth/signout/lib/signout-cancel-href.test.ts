import { test } from "node:test";
import assert from "node:assert/strict";

import { signOutCancelHref } from "./signout-cancel-href";

const APP = "https://workouts.peptideos.us";

function assertRelativeSafePath(href: string, message?: string) {
  assert.match(href, /^\//, message);
  assert.doesNotMatch(href, /^\/\//, message);
  assert.doesNotMatch(href, /^https?:/i, message);
  assert.doesNotMatch(href, /^(javascript|data|vbscript):/i, message);
}

test("cancel uses a same-origin previous page as a relative path", () => {
  assert.equal(signOutCancelHref(`${APP}/en/profile?tab=history`, APP), "/en/profile?tab=history");
  assert.equal(signOutCancelHref(`${APP}/fr/programs/strength`, APP), "/fr/programs/strength");
  assert.equal(signOutCancelHref("/en/statistics", APP), "/en/statistics");
});

test("cancel falls back to WC home when the previous page is missing or unsafe", () => {
  const rejected = [
    undefined,
    "",
    "https://evil.example/phish",
    "//evil.example/phish",
    "/en\\evil.example",
    "/en/%5cevil.example",
    "https://evil@workouts.peptideos.us/phish",
    "https://workouts.peptideos.us.evil.example/",
    "javascript:alert(1)",
    "https://peptideos.us/login",
    `${APP}/en/profile\u0000`
  ];

  for (const referer of rejected) {
    const href = signOutCancelHref(referer, APP);
    assert.equal(href, "/", referer);
    assertRelativeSafePath(href, String(referer));
  }
});

test("cancel does not loop back to the sign-out confirmation page", () => {
  assert.equal(signOutCancelHref(`${APP}/auth/signout`, APP), "/");
  assert.equal(signOutCancelHref(`${APP}/en/auth/signout`, APP), "/");
  assert.equal(signOutCancelHref(`${APP}/fr/auth/signout/`, APP), "/");
  assert.equal(signOutCancelHref("/zh-cn/auth/signout", APP), "/");
});

test("cancel href is never an open redirect, even with a spoofed home fallback", () => {
  const href = signOutCancelHref("https://evil.example/phish", APP, "https://evil.example/home");
  assert.equal(href, "/");
  assertRelativeSafePath(href);
});
