import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CREDENTIAL_PROVIDER_ID,
  credentialAccountWhere,
  hasCredentialPasswordAccount,
  updateCredentialPassword
} from "./update-credential-password";

test("password lookup is scoped to the credential provider only", () => {
  assert.equal(CREDENTIAL_PROVIDER_ID, "credential");
  assert.deepEqual(credentialAccountWhere("user-1"), { userId: "user-1", providerId: "credential" });
  assert.equal(hasCredentialPasswordAccount([{ providerId: "peptideos" }, { providerId: "google" }]), false);
  assert.equal(hasCredentialPasswordAccount([{ providerId: "peptideos" }, { providerId: "credential" }]), true);
});

test("refuses to update when the user has no credential account", async () => {
  const updated: string[] = [];
  await assert.rejects(
    () =>
      updateCredentialPassword(
        "user-1",
        { currentPassword: "old-pass-1", newPassword: "Newpass1!", confirmPassword: "Newpass1!" },
        {
          findCredentialAccount: async (where) => {
            assert.deepEqual(where, { userId: "user-1", providerId: "credential" });
            return null;
          },
          updateAccountPassword: async (accountId) => {
            updated.push(accountId);
          },
          hash: (value) => `hash:${value}`,
          validateNewPassword: () => true
        }
      ),
    (error: unknown) => error instanceof Error && error.message === "NO_CREDENTIAL_ACCOUNT"
  );
  assert.deepEqual(updated, []);
});

test("updates only the credential account id, never peptideos or google rows", async () => {
  const updated: Array<{ accountId: string; userId: string; hashedPassword: string }> = [];
  await updateCredentialPassword(
    "user-1",
    { currentPassword: "old-pass-1", newPassword: "Newpass1!", confirmPassword: "Newpass1!" },
    {
      findCredentialAccount: async (where) => {
        assert.equal(where.providerId, "credential");
        return { id: "acct-credential", password: "hash:old-pass-1" };
      },
      updateAccountPassword: async (accountId, userId, hashedPassword) => {
        updated.push({ accountId, userId, hashedPassword });
      },
      hash: (value) => `hash:${value}`,
      validateNewPassword: () => true
    }
  );
  assert.deepEqual(updated, [{ accountId: "acct-credential", userId: "user-1", hashedPassword: "hash:Newpass1!" }]);
});

test("rejects a wrong current password without writing", async () => {
  const updated: string[] = [];
  await assert.rejects(
    () =>
      updateCredentialPassword(
        "user-1",
        { currentPassword: "wrong", newPassword: "Newpass1!", confirmPassword: "Newpass1!" },
        {
          findCredentialAccount: async () => ({ id: "acct-credential", password: "hash:old-pass-1" }),
          updateAccountPassword: async (accountId) => {
            updated.push(accountId);
          },
          hash: (value) => `hash:${value}`,
          validateNewPassword: () => true
        }
      ),
    (error: unknown) => error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD"
  );
  assert.deepEqual(updated, []);
});
