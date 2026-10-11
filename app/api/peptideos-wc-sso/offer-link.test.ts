import { test } from "node:test";
import assert from "node:assert/strict";

import { createPeptideosLinkOffer, ssoCollisionHandoff } from "./offer-link";
import { LINK_COOKIE_NAME, LINK_PAGE_PATH, verifyLinkCookie } from "./link-cookie";

const secret = "test-better-auth-secret";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const wcUserId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const origin = "https://workouts.example.test";
const now = 1_700_000_000_000;

test("collision offer sets a signed httpOnly cookie and redirects to the link page", async () => {
  const response = await createPeptideosLinkOffer({
    peptideosUserId,
    wcUserId,
    origin,
    secret,
    now,
    jti: "offer-jti"
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${origin}${LINK_PAGE_PATH}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`${LINK_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/i);
  const value = cookie.split(";")[0].slice(`${LINK_COOKIE_NAME}=`.length);
  const payload = await verifyLinkCookie(value, secret, now);
  assert.deepEqual(payload, {
    v: 1,
    peptideosUserId,
    wcUserId,
    jti: "offer-jti",
    exp: now + 10 * 60 * 1000
  });
});

test("sso collision with a bound user id offers the link page and burns the handoff", async () => {
  const result = await ssoCollisionHandoff({
    completed: { ok: false, error: "sso_email_collision", status: 409, wroteUserState: false, collidingUserId: wcUserId },
    peptideosUserId,
    origin,
    secret,
    now,
    jti: "handoff-jti"
  });

  assert.equal(result.disposition, "keep");
  assert.equal(result.value.status, 307);
  assert.equal(result.value.headers.get("location"), `${origin}${LINK_PAGE_PATH}`);
});

test("sso collision without a bound user id stays a generic 409 and still burns the handoff", async () => {
  const result = await ssoCollisionHandoff({
    completed: { ok: false, error: "sso_email_collision", status: 409, wroteUserState: false },
    peptideosUserId,
    origin,
    secret,
    now
  });

  assert.equal(result.disposition, "keep");
  assert.equal(result.value.status, 409);
  const body = await result.value.json();
  assert.deepEqual(body, { error: "sso_email_collision" });
});
