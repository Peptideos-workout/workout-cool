import { test } from "node:test";
import assert from "node:assert/strict";

import { completePeptideOsSsoLogin } from "./complete-sso";

const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const derivedHash = "sso-derived-hash";

function trackingDeps(overrides: Partial<Parameters<typeof completePeptideOsSsoLogin>[3]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      signUpNewUser: async () => {
        calls.push("signUpNewUser");
        return { userId: "new-user" };
      },
      createCredential: async (userId: string) => {
        calls.push(`createCredential:${userId}`);
      },
      createPeptideosAccount: async (userId: string) => {
        calls.push(`createPeptideosAccount:${userId}`);
      },
      updateCredentialPassword: async (credentialId: string) => {
        calls.push(`updateCredentialPassword:${credentialId}`);
      },
      signInWithDerivedPassword: async () => {
        calls.push("signInWithDerivedPassword");
        return true;
      },
      signInWithTrustedSession: async (userId: string) => {
        calls.push(`signInWithTrustedSession:${userId}`);
        return true;
      },
      ...overrides
    }
  };
}

test("new PeptideOS user signs up and links without touching another password", async () => {
  const { calls, deps } = trackingDeps();
  const result = await completePeptideOsSsoLogin(peptideosUserId, derivedHash, {
    existingUser: null,
    existingCredential: null,
    peptideosAccountId: null
  }, deps);

  assert.deepEqual(result, { ok: true, userId: "new-user" });
  assert.deepEqual(calls, ["signUpNewUser", "createPeptideosAccount:new-user", "signInWithDerivedPassword"]);
  assert.ok(!calls.some((call) => call.startsWith("updateCredentialPassword")));
});

test("email collision does not reset an existing account credential", async () => {
  const { calls, deps } = trackingDeps();
  const result = await completePeptideOsSsoLogin(peptideosUserId, derivedHash, {
    existingUser: { id: "victim" },
    existingCredential: { id: "cred-1", password: "victim-hash" },
    peptideosAccountId: null
  }, deps);

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409 });
  assert.deepEqual(calls, []);
});

test("same identity without a credential creates one and never updates a password", async () => {
  const { calls, deps } = trackingDeps();
  const result = await completePeptideOsSsoLogin(peptideosUserId, derivedHash, {
    existingUser: { id: peptideosUserId },
    existingCredential: null,
    peptideosAccountId: null
  }, deps);

  assert.equal(result.ok, true);
  assert.ok(calls.includes(`createCredential:${peptideosUserId}`));
  assert.ok(!calls.some((call) => call.startsWith("updateCredentialPassword")));
});

test("linked identity with a different password uses a trusted session instead of overwrite", async () => {
  const { calls, deps } = trackingDeps({
    signInWithDerivedPassword: async () => {
      calls.push("signInWithDerivedPassword");
      return false;
    }
  });

  const result = await completePeptideOsSsoLogin(peptideosUserId, derivedHash, {
    existingUser: { id: "wc-user" },
    existingCredential: { id: "cred-1", password: "user-chosen-hash" },
    peptideosAccountId: peptideosUserId
  }, deps);

  assert.deepEqual(result, { ok: true, userId: "wc-user" });
  assert.ok(calls.includes("signInWithTrustedSession:wc-user"));
  assert.ok(!calls.includes("createCredential:wc-user"));
  assert.ok(!calls.some((call) => call.startsWith("updateCredentialPassword")));
});
