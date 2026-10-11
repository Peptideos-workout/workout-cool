import { test } from "node:test";
import assert from "node:assert/strict";

import { maskEmail } from "./mask-email";

test("masks the local part and leaves the domain", () => {
  assert.equal(maskEmail("jane.doe@example.com"), "j***@example.com");
  assert.equal(maskEmail("a@example.com"), "*@example.com");
});

test("does not return the raw email", () => {
  const raw = "athlete@workout.cool";
  const masked = maskEmail(raw);
  assert.notEqual(masked, raw);
  assert.equal(masked.includes("athlete"), false);
});
