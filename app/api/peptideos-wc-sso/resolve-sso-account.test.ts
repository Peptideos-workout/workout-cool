import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSsoAccountAction } from "./resolve-sso-account";

const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

test("creates a new workout-cool user when the email is unused", () => {
  assert.deepEqual(
    resolveSsoAccountAction(peptideosUserId, { existingUser: null, peptideosAccountId: null }),
    { type: "create_user" },
  );
});

test("rejects an email collision that is not a linked PeptideOS identity", () => {
  assert.deepEqual(
    resolveSsoAccountAction(peptideosUserId, {
      existingUser: { id: "unrelated-wc-user" },
      peptideosAccountId: null
    }),
    { type: "reject", error: "sso_email_collision" },
  );
});

test("rejects a Google-only account that only shares an email", () => {
  assert.deepEqual(
    resolveSsoAccountAction(peptideosUserId, {
      existingUser: { id: "google-user" },
      peptideosAccountId: null
    }),
    { type: "reject", error: "sso_email_collision" },
  );
});

test("does not treat existingUser.id === peptideosUserId as identity proof", () => {
  const action = resolveSsoAccountAction(peptideosUserId, {
    existingUser: { id: peptideosUserId },
    peptideosAccountId: null
  });

  assert.deepEqual(action, { type: "reject", error: "sso_email_collision" });
});

test("signs in only when a peptideos account already links this PeptideOS user", () => {
  assert.deepEqual(
    resolveSsoAccountAction(peptideosUserId, {
      existingUser: { id: "wc-user" },
      peptideosAccountId: peptideosUserId
    }),
    { type: "sign_in", userId: "wc-user" },
  );
});
