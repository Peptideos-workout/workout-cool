import { test } from "node:test";
import assert from "node:assert/strict";

import { isWorkoutCoolSigninPath, isWorkoutCoolSignupPath } from "./signup-http-redirect";

test("matches /auth/signup with or without a locale prefix", () => {
  assert.equal(isWorkoutCoolSignupPath("/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/auth/signup/"), true);
  assert.equal(isWorkoutCoolSignupPath("/en/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/zh-CN/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/zh-cn/auth/signup"), true);
  assert.equal(isWorkoutCoolSignupPath("/ZH-CN/auth/signup/"), true);
  assert.equal(isWorkoutCoolSignupPath("/fr/auth/signup/"), true);
});

test("matches /auth/signin with locale-agnostic prefixes", () => {
  assert.equal(isWorkoutCoolSigninPath("/auth/signin"), true);
  assert.equal(isWorkoutCoolSigninPath("/en/auth/signin"), true);
  assert.equal(isWorkoutCoolSigninPath("/zh-cn/auth/signin"), true);
  assert.equal(isWorkoutCoolSigninPath("/zh-CN/auth/signin/"), true);
  assert.equal(isWorkoutCoolSigninPath("/auth/signup"), false);
});

test("does not match other auth routes", () => {
  assert.equal(isWorkoutCoolSignupPath("/auth/signin"), false);
  assert.equal(isWorkoutCoolSignupPath("/auth/signup/extra"), false);
  assert.equal(isWorkoutCoolSignupPath("/profile"), false);
  assert.equal(isWorkoutCoolSignupPath("/api/auth/signup"), false);
});
