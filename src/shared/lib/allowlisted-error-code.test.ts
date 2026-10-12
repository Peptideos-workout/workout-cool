import { test } from "node:test";
import assert from "node:assert/strict";

import { KNOWN_ERROR_CODES, isAllowlistedErrorCode } from "./allowlisted-error-code";

const DROPPED_TOKENS = ["sk_live_fixturetoken01", "ABCDEFGHJKLMNPQRSTUVWX", "ABCDEFGHIJKLMNOPQRSTUVWXYZABCD"];

test("accepts every known code and the short Prisma and SQL shapes", () => {
  for (const code of KNOWN_ERROR_CODES) {
    assert.equal(isAllowlistedErrorCode(code), true, code);
  }
  assert.equal(isAllowlistedErrorCode("P2002"), true);
  assert.equal(isAllowlistedErrorCode("42P01"), true);
  assert.equal(isAllowlistedErrorCode("23505"), true);
  assert.equal(isAllowlistedErrorCode("BAD_REQUEST"), true);
});

test("drops fixture tokens, a long uppercase token, and a known code with extra text", () => {
  for (const token of DROPPED_TOKENS) {
    assert.equal(isAllowlistedErrorCode(token), false, token);
  }
  assert.equal(isAllowlistedErrorCode("UNAUTHORIZED_EXTRA"), false);
  assert.equal(isAllowlistedErrorCode("sk_live_fixturetoken01"), false);
});
