import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSsoAccountAction } from "./resolve-sso-account";

const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const derivedHash = "sso-derived-hash";

test("creates a new workout-cool user when the email is unused", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: null,
    existingCredential: null,
    peptideosAccountId: null
  });

  assert.deepEqual(action, { type: "create_user" });
});

test("rejects an email collision that is not the same PeptideOS identity", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: { id: "unrelated-wc-user" },
    existingCredential: { id: "cred-1", password: "someone-elses-password-hash" },
    peptideosAccountId: null
  });

  assert.deepEqual(action, { type: "reject", error: "sso_email_collision" });
  assert.notEqual(action.type, "sign_in");
});

test("rejects a Google-only account that only shares an email", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: { id: "google-user" },
    existingCredential: null,
    peptideosAccountId: null
  });

  assert.deepEqual(action, { type: "reject", error: "sso_email_collision" });
});

test("links a missing credential when the WC user id is the PeptideOS user id", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: { id: peptideosUserId },
    existingCredential: null,
    peptideosAccountId: null
  });

  assert.deepEqual(action, {
    type: "sign_in",
    userId: peptideosUserId,
    createCredential: true,
    createPeptideosAccount: true,
    allowTrustedSession: false
  });
});

test("signs in without writing a password when the existing credential already matches", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: { id: "wc-user" },
    existingCredential: { id: "cred-1", password: derivedHash },
    peptideosAccountId: peptideosUserId
  });

  assert.equal(action.type, "sign_in");
  if (action.type !== "sign_in") return;
  assert.equal(action.createCredential, false);
  assert.equal(action.allowTrustedSession, false);
  assert.equal(action.createPeptideosAccount, false);
});

test("never overwrites an existing credential when identity is already linked", () => {
  const action = resolveSsoAccountAction(peptideosUserId, derivedHash, {
    existingUser: { id: "wc-user" },
    existingCredential: { id: "cred-1", password: "user-chosen-password-hash" },
    peptideosAccountId: peptideosUserId
  });

  assert.equal(action.type, "sign_in");
  if (action.type !== "sign_in") return;
  assert.equal(action.createCredential, false);
  assert.equal(action.allowTrustedSession, true);
});
