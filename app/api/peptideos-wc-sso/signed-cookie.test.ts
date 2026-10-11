import { test } from "node:test";
import assert from "node:assert/strict";

import { serializeBetterAuthSignedCookie, signBetterAuthCookieValue, verifyBetterAuthCookieValue } from "./signed-cookie";

test("Better Auth session cookies are signed, not raw tokens", async () => {
  const token = "session-token-plain";
  const secret = "test-better-auth-secret";
  const signed = await signBetterAuthCookieValue(token, secret);

  assert.notEqual(signed, token);
  assert.match(decodeURIComponent(signed), /^session-token-plain\.[A-Za-z0-9+/=]{44}$/);
  assert.equal(await verifyBetterAuthCookieValue(signed, secret), token);
  assert.equal(await verifyBetterAuthCookieValue(signed, "other-secret"), null);
});

test("serialized Set-Cookie uses the signed value Better Auth will verify", async () => {
  const header = await serializeBetterAuthSignedCookie("better-auth.session_token", "abc", "secret", {
    path: "/",
    httpOnly: true,
    sameSite: "lax"
  });

  assert.match(header, /^better-auth\.session_token=/);
  assert.doesNotMatch(header, /session_token=abc;/);
  const value = header.split(";")[0].slice("better-auth.session_token=".length);
  assert.equal(await verifyBetterAuthCookieValue(value, "secret"), "abc");
});
