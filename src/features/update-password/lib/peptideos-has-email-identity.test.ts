import { test } from "node:test";
import assert from "node:assert/strict";

import { isAuthUserId, peptideosHasEmailIdentity } from "./peptideos-has-email-identity";

const AUTH_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

test("accepts only a UUID auth user id", () => {
  assert.equal(isAuthUserId(AUTH_USER_ID), true);
  assert.equal(isAuthUserId("not-a-uuid"), false);
  assert.equal(isAuthUserId(""), false);
});

test("returns true only when the read-only check reports an email identity", async () => {
  const queried: string[] = [];
  const result = await peptideosHasEmailIdentity(AUTH_USER_ID, async (userId) => {
    queried.push(userId);
    return true;
  });
  assert.equal(result, true);
  assert.deepEqual(queried, [AUTH_USER_ID]);
});

test("returns false for an OAuth-only PeptideOS user", async () => {
  const result = await peptideosHasEmailIdentity(AUTH_USER_ID, async () => false);
  assert.equal(result, false);
});

test("fails closed on a missing, invalid, or non-boolean result", async () => {
  assert.equal(await peptideosHasEmailIdentity(null, async () => true), null);
  assert.equal(await peptideosHasEmailIdentity(undefined, async () => true), null);
  assert.equal(await peptideosHasEmailIdentity("wc-user-1", async () => true), null);
  assert.equal(await peptideosHasEmailIdentity(AUTH_USER_ID, async () => "yes"), null);
  assert.equal(await peptideosHasEmailIdentity(AUTH_USER_ID, async () => null), null);
});

test("fails closed when the database check throws (function not deployed)", async () => {
  const result = await peptideosHasEmailIdentity(AUTH_USER_ID, async () => {
    throw new Error("function wc.peptideos_has_email_identity(uuid) does not exist");
  });
  assert.equal(result, null);
});

test("does not query when the PeptideOS account id is not a UUID", async () => {
  let called = false;
  const result = await peptideosHasEmailIdentity("not-a-uuid", async () => {
    called = true;
    return true;
  });
  assert.equal(result, null);
  assert.equal(called, false);
});
