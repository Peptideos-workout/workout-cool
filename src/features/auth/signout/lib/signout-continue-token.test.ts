import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SIGNOUT_CONTINUE_COOKIE,
  SIGNOUT_CONTINUE_TTL_SECONDS,
  consumeSignoutContinueToken,
  issueSignoutContinueToken,
  signoutContinueCookieOptions,
  signoutContinueView
} from "./signout-continue-token";

const SECRET = "test-signout-continue-secret";

test("issued token is valid once, then replayed token is confirm-only", () => {
  const issuedAt = 1_700_000_000_000;
  const raw = issueSignoutContinueToken(issuedAt, SECRET);

  assert.equal(signoutContinueView(raw, issuedAt + 1_000, SECRET), "auto-submit");
  assert.equal(signoutContinueView(raw, issuedAt + 2_000, SECRET), "confirm");
  assert.equal(consumeSignoutContinueToken(raw, issuedAt + 3_000, SECRET), false);
});

test("missing token is confirm-only and never auto-submits", () => {
  assert.equal(signoutContinueView(undefined, Date.now(), SECRET), "confirm");
  assert.equal(signoutContinueView("", Date.now(), SECRET), "confirm");
  assert.equal(consumeSignoutContinueToken(undefined, Date.now(), SECRET), false);
  assert.equal(consumeSignoutContinueToken("", Date.now(), SECRET), false);
});

test("expired token is confirm-only even on the first consume", () => {
  const issuedAt = 1_700_000_000_000;
  const raw = issueSignoutContinueToken(issuedAt, SECRET);
  const afterTtl = issuedAt + SIGNOUT_CONTINUE_TTL_SECONDS * 1000;

  assert.equal(signoutContinueView(raw, afterTtl, SECRET), "confirm");
  assert.equal(signoutContinueView(raw, afterTtl + 1, SECRET), "confirm");
});

test("unknown or forged token is confirm-only", () => {
  const issuedAt = 1_700_000_000_000;
  const raw = issueSignoutContinueToken(issuedAt, SECRET);

  assert.equal(signoutContinueView("not-issued", issuedAt, SECRET), "confirm");
  assert.equal(consumeSignoutContinueToken("forged-token", issuedAt, SECRET), false);
  assert.equal(signoutContinueView(`${raw}x`, issuedAt, SECRET), "confirm");
  assert.equal(signoutContinueView(raw, issuedAt, "other-secret"), "confirm");
});

test("continue cookie is short-lived, HttpOnly, Secure, and SameSite=Strict", () => {
  assert.equal(SIGNOUT_CONTINUE_COOKIE, "wc_signout_continue");
  assert.equal(SIGNOUT_CONTINUE_TTL_SECONDS, 60);

  const options = signoutContinueCookieOptions(true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.maxAge, 60);
  assert.equal(options.path, "/");
});
