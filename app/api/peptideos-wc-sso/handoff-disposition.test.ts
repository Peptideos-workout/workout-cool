import { test } from "node:test";
import assert from "node:assert/strict";

import { handoffDisposition } from "./handoff-disposition";

test("409 collisions burn the handoff token", () => {
  assert.equal(handoffDisposition(409, false), "keep");
});

test("never releases after a user, link, or session write", () => {
  assert.equal(handoffDisposition(500, true), "keep");
  assert.equal(handoffDisposition(302, true), "keep");
});

test("a failed sign-in before any write still keeps the claimed handoff", () => {
  assert.equal(handoffDisposition(500, false), "keep");
  assert.equal(handoffDisposition(400, false), "keep");
});
