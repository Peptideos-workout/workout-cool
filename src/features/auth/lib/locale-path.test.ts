import { test } from "node:test";
import assert from "node:assert/strict";

import { stripLocalePrefix } from "./locale-path";

test("strips locale prefixes case-insensitively, including zh-cn", () => {
  assert.equal(stripLocalePrefix("/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/en/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/zh-CN/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/zh-cn/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/ZH-CN/auth/signin"), "/auth/signin");
  assert.equal(stripLocalePrefix("/pt/auth/signout/"), "/auth/signout");
  assert.equal(stripLocalePrefix("/fr/legal/privacy"), "/legal/privacy");
});

test("treats a locale-only path as root", () => {
  assert.equal(stripLocalePrefix("/en"), "/");
  assert.equal(stripLocalePrefix("/zh-cn"), "/");
  assert.equal(stripLocalePrefix("/zh-CN/"), "/");
});
