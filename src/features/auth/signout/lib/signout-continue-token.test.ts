import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SIGNOUT_CONTINUE_COOKIE,
  SIGNOUT_CONTINUE_HOST_COOKIE,
  SIGNOUT_CONTINUE_OK_HEADER,
  SIGNOUT_CONTINUE_TTL_SECONDS,
  consumeSignoutContinueToken,
  isSignoutContinueAutoSubmitHeader,
  issueSignoutContinueToken,
  readSignoutContinueCookie,
  readSignoutContinueDecision,
  signSignoutContinueDecision,
  signoutContinueCookieName,
  signoutContinueCookieOptions,
  signoutContinueView
} from "./signout-continue-token";

const SECRET = "test-signout-continue-secret";

test("issued token is valid once, then replayed token is confirm-only", () => {
  const issuedAt = 1_700_000_000_000;
  const raw = issueSignoutContinueToken(issuedAt, SECRET);
  assert.ok(raw);

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
  assert.ok(raw);
  const afterTtl = issuedAt + SIGNOUT_CONTINUE_TTL_SECONDS * 1000;

  assert.equal(signoutContinueView(raw, afterTtl, SECRET), "confirm");
  assert.equal(signoutContinueView(raw, afterTtl + 1, SECRET), "confirm");
});

test("unknown or forged token is confirm-only", () => {
  const issuedAt = 1_700_000_000_000;
  const raw = issueSignoutContinueToken(issuedAt, SECRET);
  assert.ok(raw);

  assert.equal(signoutContinueView("not-issued", issuedAt, SECRET), "confirm");
  assert.equal(consumeSignoutContinueToken("forged-token", issuedAt, SECRET), false);
  assert.equal(signoutContinueView(`${raw}x`, issuedAt, SECRET), "confirm");
  assert.equal(signoutContinueView(raw, issuedAt, "other-secret"), "confirm");
});

test("missing BETTER_AUTH_SECRET falls back to the click page instead of throwing", () => {
  assert.equal(issueSignoutContinueToken(Date.now(), ""), null);
  assert.equal(consumeSignoutContinueToken("anything", Date.now(), ""), false);
  assert.equal(signoutContinueView("anything", Date.now(), ""), "confirm");
});

test("continue cookie is short-lived, HttpOnly, Secure, SameSite=Strict, and __Host- when Secure", () => {
  assert.equal(SIGNOUT_CONTINUE_COOKIE, "wc_signout_continue");
  assert.equal(SIGNOUT_CONTINUE_HOST_COOKIE, "__Host-wc_signout_continue");
  assert.equal(SIGNOUT_CONTINUE_OK_HEADER, "x-wc-signout-continue");
  assert.equal(SIGNOUT_CONTINUE_TTL_SECONDS, 60);

  const secureOptions = signoutContinueCookieOptions(true);
  assert.equal(signoutContinueCookieName(true), SIGNOUT_CONTINUE_HOST_COOKIE);
  assert.equal(secureOptions.httpOnly, true);
  assert.equal(secureOptions.secure, true);
  assert.equal(secureOptions.sameSite, "strict");
  assert.equal(secureOptions.maxAge, 60);
  assert.equal(secureOptions.path, "/");
  assert.equal("domain" in secureOptions, false);

  const devOptions = signoutContinueCookieOptions(false);
  assert.equal(signoutContinueCookieName(false), SIGNOUT_CONTINUE_COOKIE);
  assert.equal(devOptions.secure, false);
  assert.equal(devOptions.path, "/");
});

test("signed continue decision is accepted; a raw 1 from the client is not", () => {
  const now = 1_700_000_000_000;
  const signed = signSignoutContinueDecision(true, now, SECRET);
  assert.ok(signed);
  assert.equal(readSignoutContinueDecision(signed, now + 50, SECRET), true);
  assert.equal(readSignoutContinueDecision("1", now, SECRET), null);
  assert.equal(readSignoutContinueDecision(signed, now + 11_000, SECRET), null);

  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = SECRET;
  try {
    const fresh = signSignoutContinueDecision(true, Date.now(), SECRET);
    assert.ok(fresh);
    assert.equal(isSignoutContinueAutoSubmitHeader(new Headers({ [SIGNOUT_CONTINUE_OK_HEADER]: "1" })), false);
    assert.equal(isSignoutContinueAutoSubmitHeader(new Headers({ [SIGNOUT_CONTINUE_OK_HEADER]: fresh })), true);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("readSignoutContinueCookie prefers the __Host- name", () => {
  assert.equal(
    readSignoutContinueCookie({
      get: (name) => {
        if (name === SIGNOUT_CONTINUE_HOST_COOKIE) return { value: "host-token" };
        if (name === SIGNOUT_CONTINUE_COOKIE) return { value: "plain-token" };
        return undefined;
      }
    }),
    "host-token"
  );
  assert.equal(
    readSignoutContinueCookie({
      get: (name) => (name === SIGNOUT_CONTINUE_COOKIE ? { value: "plain-token" } : undefined)
    }),
    "plain-token"
  );
});
