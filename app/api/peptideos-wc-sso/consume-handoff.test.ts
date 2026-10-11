import { test } from "node:test";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";
import { consumeWorkoutCoolHandoff, releaseHandoffClaimByHash, runWithHandoffClaim } from "./consume-handoff";

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

test("release uses compare-and-set on the claimed timestamp and never the plaintext token", async () => {
  const rawToken = "plaintext-handoff-from-query-string";
  const seen: unknown[] = [];

  await releaseHandoffClaimByHash(
    {
      $executeRaw: async (_query: TemplateStringsArray, tokenHash: unknown, consumedAt: unknown) => {
        seen.push(tokenHash, consumedAt);
        return 1;
      }
    },
    hashHandoffToken(rawToken),
    claimedAt,
  );

  assert.deepEqual(seen, [hashHandoffToken(rawToken), claimedAt]);
  assert.notEqual(seen[0], rawToken);
});

test("keeps the claim on success and on 409; releases only before any user write", async () => {
  const rawToken = "single-use-handoff";
  const tokenHash = hashHandoffToken(rawToken);
  const released: Array<{ hash: string; at: Date }> = [];

  const deps = {
    claimByHash: async (hash: string) => {
      assert.equal(hash, tokenHash);
      return [{ user_id: "user-1", consumed_at: claimedAt }];
    },
    releaseByHash: async (hash: string, at: Date) => {
      released.push({ hash, at });
    }
  };

  const success = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 302 },
    disposition: "keep"
  }));
  assert.equal(success.outcome, "success");
  assert.deepEqual(released, []);

  const burned = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 409 },
    disposition: "keep"
  }));
  assert.equal(burned.outcome, "success");
  assert.deepEqual(released, []);

  const releasedBeforeWrite = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 500 },
    disposition: "release"
  }));
  assert.equal(releasedBeforeWrite.outcome, "failure");
  assert.deepEqual(released, [{ hash: tokenHash, at: claimedAt }]);
});

test("does not release after a throw (writes may already have happened)", async () => {
  const released: unknown[] = [];

  const result = await runWithHandoffClaim(
    "throws-after-claim",
    {
      claimByHash: async () => [{ user_id: "user-1", consumed_at: claimedAt }],
      releaseByHash: async (hash, at) => {
        released.push(hash, at);
      }
    },
    async () => {
      throw new Error("sign-in exploded");
    },
  );

  assert.equal(result.outcome, "error");
  assert.deepEqual(released, []);
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
    runWithHandoffClaim(rawToken, { claimByHash, releaseByHash: async () => undefined }, async () => ({
      value: "ok",
      disposition: "keep"
    })),
    runWithHandoffClaim(rawToken, { claimByHash, releaseByHash: async () => undefined }, async () => ({
      value: "ok",
      disposition: "keep"
    }))
  ]);

  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["invalid_or_expired_handoff", "success"]);
});
