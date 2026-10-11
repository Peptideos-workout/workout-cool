import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";

test("hashes a PeptideOS-issued token as lowercase sha256 hex", () => {
  const rawToken = "n0t-the-stored-value_base64urlToken";
  const expected = createHash("sha256").update(rawToken, "utf8").digest("hex");

  const hashed = hashHandoffToken(rawToken);

  assert.equal(hashed, expected);
  assert.match(hashed, /^[0-9a-f]{64}$/);
  assert.notEqual(hashed, rawToken);
});

test("is deterministic and never returns the plaintext token", () => {
  const rawToken = "another-single-use-handoff";

  assert.equal(hashHandoffToken(rawToken), hashHandoffToken(rawToken));
  assert.notEqual(hashHandoffToken(rawToken), rawToken);
  assert.notEqual(hashHandoffToken(rawToken), hashHandoffToken(`${rawToken}x`));
});
