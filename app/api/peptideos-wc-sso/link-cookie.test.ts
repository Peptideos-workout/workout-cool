import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyBetterAuthCookieValue } from "./signed-cookie";
import {
  LINK_COOKIE_MAX_AGE_SECONDS,
  LINK_COOKIE_NAME,
  createLinkCookiePayload,
  parseLinkCookiePayload,
  serializeLinkCookie,
  verifyLinkCookie
} from "./link-cookie";

const secret = "test-better-auth-secret";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const wcUserId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const now = 1_700_000_000_000;

test("signed link cookie binds PeptideOS user id to the colliding workout-cool user id", async () => {
  const payload = createLinkCookiePayload({
    peptideosUserId,
    wcUserId,
    now,
    jti: "jti-1"
  });

  assert.equal(payload.peptideosUserId, peptideosUserId);
  assert.equal(payload.wcUserId, wcUserId);
  assert.equal(payload.exp, now + LINK_COOKIE_MAX_AGE_SECONDS * 1000);
  assert.equal(payload.jti, "jti-1");

  const header = await serializeLinkCookie(payload, secret);
  assert.match(header, new RegExp(`^${LINK_COOKIE_NAME}=`));
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /Path=\//);
  assert.match(header, new RegExp(`Max-Age=${LINK_COOKIE_MAX_AGE_SECONDS}`));

  const value = header.split(";")[0].slice(`${LINK_COOKIE_NAME}=`.length);
  const signed = await verifyBetterAuthCookieValue(value, secret);
  assert.ok(signed);
  assert.deepEqual(parseLinkCookiePayload(signed), payload);
  assert.deepEqual(await verifyLinkCookie(value, secret, now), payload);
});

test("rejects an expired or tampered link cookie", async () => {
  const payload = createLinkCookiePayload({
    peptideosUserId,
    wcUserId,
    now,
    jti: "jti-expired"
  });
  const header = await serializeLinkCookie(payload, secret);
  const value = header.split(";")[0].slice(`${LINK_COOKIE_NAME}=`.length);

  assert.equal(await verifyLinkCookie(value, secret, payload.exp), null);
  assert.equal(await verifyLinkCookie(value, secret, payload.exp + 1), null);
  assert.equal(await verifyLinkCookie(value, "other-secret", now), null);
  assert.equal(await verifyLinkCookie("not-a-cookie", secret, now), null);
});
