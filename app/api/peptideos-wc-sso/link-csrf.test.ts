import { test } from "node:test";
import assert from "node:assert/strict";

import { isTrustedMutationOrigin } from "./link-csrf";

test("accepts an Origin that matches Better Auth trusted origins", () => {
  assert.equal(isTrustedMutationOrigin("https://workouts.example.test", ["https://workouts.example.test", "workoutcool://"]), true);
});

test("rejects a missing or cross-site Origin", () => {
  const trusted = ["https://workouts.example.test"];
  assert.equal(isTrustedMutationOrigin(null, trusted), false);
  assert.equal(isTrustedMutationOrigin("https://evil.example", trusted), false);
  assert.equal(isTrustedMutationOrigin("not-a-url", trusted), false);
});
