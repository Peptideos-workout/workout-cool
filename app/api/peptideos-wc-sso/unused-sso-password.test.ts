import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { newUnusedSsoPassword } from "./unused-sso-password";

test("new SSO passwords are unique random secrets, not HMAC-derived", () => {
  const first = newUnusedSsoPassword();
  const second = newUnusedSsoPassword();
  assert.equal(first.length, 64);
  assert.notEqual(first, second);
});

test("SSO route does not derive passwords from SUPABASE_JWT_SECRET", () => {
  const src = readFileSync("app/api/peptideos-wc-sso/route.ts", "utf8");
  assert.doesNotMatch(src, /deriveWorkoutCoolCredentialFromSupabaseJwtSecret/);
  assert.doesNotMatch(src, /SUPABASE_JWT_SECRET/);
  assert.match(src, /newUnusedSsoPassword/);
});
