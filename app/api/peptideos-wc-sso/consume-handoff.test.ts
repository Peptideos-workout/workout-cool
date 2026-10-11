import { test } from "node:test";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";
import { consumeWorkoutCoolHandoff } from "./consume-handoff";

test("looks up the hashed token and never passes plaintext to the database", async () => {
  const rawToken = "plaintext-handoff-from-query-string";
  const userId = "11111111-1111-1111-1111-111111111111";
  const seen: string[] = [];

  const user = await consumeWorkoutCoolHandoff(rawToken, async (tokenHash) => {
    seen.push(tokenHash);
    assert.equal(tokenHash, hashHandoffToken(rawToken));
    assert.notEqual(tokenHash, rawToken);
    return [{ user_id: userId }];
  });

  assert.equal(user, userId);
  assert.deepEqual(seen, [hashHandoffToken(rawToken)]);
});

test("returns null when the hashed token is missing, consumed, or expired", async () => {
  const user = await consumeWorkoutCoolHandoff("unknown-token", async (tokenHash) => {
    assert.equal(tokenHash, hashHandoffToken("unknown-token"));
    return [];
  });

  assert.equal(user, null);
});
