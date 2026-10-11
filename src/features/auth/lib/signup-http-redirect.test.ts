import { test } from "node:test";
import assert from "node:assert/strict";

import { isWorkoutCoolSignupPath } from "./signup-http-redirect";

test("matches /auth/signup with or without a locale prefix", () => {
  assert.equal(isWorkoutCoolSignupPath("/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/auth/signup/"), true);
  assert.equal(isWorkoutCoolSignupPath("/en/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/zh-CN/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/fr/auth/signup/"), true);
});

test("does not match other auth routes", () => {
  assert.equal(isWorkoutCoolSignupPath("/auth/signin"), false);
  assert.equal(isWorkoutCoolSignupPath("/auth/signup/extra"), false);
  assert.equal(isWorkoutCoolSignupPath("/profile"), false);
  assert.equal(isWorkoutCoolSignupPath("/api/auth/signup"), false);
});
