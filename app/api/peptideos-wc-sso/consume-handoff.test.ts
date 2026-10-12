import { test } from "node:test";
import assert from "node:assert/strict";

import { hashHandoffToken } from "./hash-handoff-token";
import { runWithHandoffClaim } from "./consume-handoff";

const claimedAt = new Date("2026-10-11T18:00:00.000Z");

test("a claimed handoff stays consumed after the run returns and is not reusable", async () => {
  const rawToken = "single-use-handoff";
  const tokenHash = hashHandoffToken(rawToken);
  let consumed = false;

  const deps = {
    claimByHash: async (hash: string) => {
      assert.equal(hash, tokenHash);
      assert.notEqual(hash, rawToken);
      if (consumed) return [];
      consumed = true;
      return [{ user_id: "user-1", consumed_at: claimedAt }];
    }
  };

  const failed = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 409 },
    disposition: "keep" as const
  }));
  assert.equal(failed.outcome, "success");
  if (failed.outcome === "success") {
    assert.deepEqual(failed.value, { status: 409 });
  }
  assert.equal(consumed, true);

  const retry = await runWithHandoffClaim(rawToken, deps, async () => ({
    value: { status: 302 },
    disposition: "keep" as const
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
    async () => ({ value: "ok", disposition: "keep" as const }),
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
      disposition: "keep" as const
    })),
    runWithHandoffClaim(rawToken, { claimByHash }, async () => ({
      value: "ok",
      disposition: "keep" as const
    }))
  ]);

  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["invalid_or_expired_handoff", "success"]);
});
