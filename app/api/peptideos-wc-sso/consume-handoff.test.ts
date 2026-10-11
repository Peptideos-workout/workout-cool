import { test } from "node:test";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";
import { consumeWorkoutCoolHandoff, releaseHandoffClaimByHash, runWithHandoffClaim } from "./consume-handoff";

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

test("release rolls back the claim using the hash, never the plaintext token", async () => {
  const rawToken = "plaintext-handoff-from-query-string";
  const seen: unknown[] = [];

  await releaseHandoffClaimByHash(
    {
      $executeRaw: async (_query: TemplateStringsArray, tokenHash: unknown) => {
        seen.push(tokenHash);
        return 1;
      }
    },
    hashHandoffToken(rawToken),
  );

  assert.deepEqual(seen, [hashHandoffToken(rawToken)]);
  assert.notEqual(seen[0], rawToken);
});

test("keeps the claim when sign-in succeeds and rolls it back when sign-in fails", async () => {
  const rawToken = "single-use-handoff";
  const tokenHash = hashHandoffToken(rawToken);
  const released: string[] = [];
  let claimed = false;

  const deps = {
    claimByHash: async (hash: string) => {
      assert.equal(hash, tokenHash);
      if (claimed) return [];
      claimed = true;
      return [{ user_id: "user-1" }];
    },
    releaseByHash: async (hash: string) => {
      assert.equal(hash, tokenHash);
      assert.notEqual(hash, rawToken);
      released.push(hash);
      claimed = false;
    }
  };

  const success = await runWithHandoffClaim(rawToken, deps, async () => ({ ok: true }), (value) => value.ok);
  assert.equal(success.outcome, "success");
  assert.deepEqual(released, []);
  assert.equal(claimed, true);

  claimed = false;
  const failure = await runWithHandoffClaim(rawToken, deps, async () => ({ ok: false }), (value) => value.ok);
  assert.equal(failure.outcome, "failure");
  assert.deepEqual(released, [tokenHash]);
  assert.equal(claimed, false);
});

test("rolls the claim back when sign-in throws", async () => {
  const rawToken = "throws-after-claim";
  const released: string[] = [];

  const result = await runWithHandoffClaim(
    rawToken,
    {
      claimByHash: async () => [{ user_id: "user-1" }],
      releaseByHash: async (hash) => {
        released.push(hash);
      }
    },
    async () => {
      throw new Error("sign-in exploded");
    },
    () => true,
  );

  assert.equal(result.outcome, "error");
  assert.deepEqual(released, [hashHandoffToken(rawToken)]);
});

test("concurrent claims are single-use: only the first atomic claim wins", async () => {
  const rawToken = "raced-token";
  let reserved = false;

  const claimByHash = async () => {
    if (reserved) return [];
    reserved = true;
    return [{ user_id: "user-1" }];
  };

  const [first, second] = await Promise.all([
    runWithHandoffClaim(rawToken, { claimByHash, releaseByHash: async () => undefined }, async () => "ok", () => true),
    runWithHandoffClaim(rawToken, { claimByHash, releaseByHash: async () => undefined }, async () => "ok", () => true)
  ]);

  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["invalid_or_expired_handoff", "success"]);
});
