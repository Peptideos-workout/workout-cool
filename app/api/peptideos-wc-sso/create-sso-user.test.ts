import { test } from "node:test";
import assert from "node:assert/strict";

import { createSsoUserIfAbsent } from "./create-sso-user";

test("rejects when the email already belongs to a workout-cool user", async () => {
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => ({ id: "google-only-victim" }),
    signUp: async () => {
      throw new Error("should not sign up");
    }
  });

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409 });
});

test("does not adopt a victim user when signup fails or is swallowed", async () => {
  let finds = 0;
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => {
      finds += 1;
      return finds === 1 ? null : { id: "google-only-victim" };
    },
    signUp: async () => null
  });

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409 });
});

test("does not adopt a victim user when signup throws (email already taken)", async () => {
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => null,
    signUp: async () => {
      throw new Error("User already exists");
    }
  });

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409 });
});

test("rejects when signup returns a different user than the email now resolves to", async () => {
  let finds = 0;
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => {
      finds += 1;
      return finds === 1 ? null : { id: "google-only-victim" };
    },
    signUp: async () => ({ userId: "attacker-created-id" })
  });

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409 });
});

test("accepts only the user id returned by signup when it matches the new email row", async () => {
  let finds = 0;
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => {
      finds += 1;
      return finds === 1 ? null : { id: "brand-new-user" };
    },
    signUp: async () => ({ userId: "brand-new-user" })
  });

  assert.deepEqual(result, { ok: true, userId: "brand-new-user" });
});

test("returns signup_failed when signup creates nothing and the email is still free", async () => {
  const result = await createSsoUserIfAbsent({
    findUserByEmail: async () => null,
    signUp: async () => null
  });

  assert.deepEqual(result, { ok: false, error: "sso_signup_failed", status: 500 });
});
