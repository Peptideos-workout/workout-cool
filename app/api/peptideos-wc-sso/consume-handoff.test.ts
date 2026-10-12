import { test } from "node:test";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";
import { consumeWorkoutCoolHandoff, runWithHandoffClaim } from "./consume-handoff";

const claimedAt = new Date("2026-10-11T18:00:00.000Z");

test("looks up the hashed token and never passes plaintext to the database", async () => {
  const rawToken = "plaintext-handoff-from-query-string";
  const userId = "11111111-1111-1111-1111-111111111111";
  const seen: string[] = [];

  const user = await consumeWorkoutCoolHandoff(rawToken, async (tokenHash) => {
    seen.push(tokenHash);
    assert.equal(tokenHash, hashHandoffToken(rawToken));
    assert.notEqual(tokenHash, rawToken);
    return [{ user_id: userId, consumed_at: claimedAt }];
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

test("a claimed handoff stays consumed after success, 409, failure, and a throw", async () => {
  const rawToken = "single-use-handoff";
  const tokenHash = hashHandoffToken(rawToken);
  let consumed = false;

  const deps = {
    claimByHash: async (hash: string) => {
      assert.equal(hash, tokenHash);
      if (consumed) return [];
      consumed = true;
      return [{ user_id: "user-1", consumed_at: claimedAt }];
    }
  };

  const failed = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 500 },
    disposition: "release"
  }));
  assert.equal(failed.outcome, "success");
  if (failed.outcome === "success") {
    assert.deepEqual(failed.value, { status: 500 });
  }
  assert.equal(consumed, true);

  const retry = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 302 },
    disposition: "keep"
  }));
  assert.equal(retry.outcome, "invalid_or_expired_handoff");
});

test("does not clear the claim after a throw", async () => {
  let consumed = false;
  const result = await runWithHandoffClaim(
    "throws-after-claim",
    {
      claimByHash: async () => {
        if (consumed) return [];
        consumed = true;
        return [{ user_id: "user-1", consumed_at: claimedAt }];
      }
    },
    async () => {
      throw new Error("sign-in exploded");
    },
  );

  assert.equal(result.outcome, "error");
  assert.equal(consumed, true);

  const retry = await runWithHandoffClaim(
    "throws-after-claim",
    {
      claimByHash: async () => (consumed ? [] : [{ user_id: "user-1", consumed_at: claimedAt }])
    },
    async () => ({ value: "ok", disposition: "keep" }),
  );
  assert.equal(retry.outcome, "invalid_or_expired_handoff");
});

test("concurrent claims are single-use: only the first atomic claim wins", async () => {
  const rawToken = "raced-token";
  let reserved = false;

  const claimByHash = async () => {
    if (reserved) return [];
    reserved = true;
    return [{ user_id: "user-1", consumed_at: claimedAt }];
  };

  const [first, second] = await Promise.all([
    runWithHandoffClaim(rawToken, { claimByHash }, async () => ({
      value: "ok",
      disposition: "keep"
    })),
    runWithHandoffClaim(rawToken, { claimByHash }, async () => ({
      value: "ok",
      disposition: "keep"
    }))
  ]);

  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["invalid_or_expired_handoff", "success"]);
});
