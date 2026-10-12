import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsSso } from "./run-sso";
import { hashHandoffToken } from "./hash-handoff-token";
import { handoffDisposition } from "./handoff-disposition";

import type { PeptideOsSsoDeps } from "./run-sso";
import type { HandoffClaimRow } from "./consume-handoff";

const rawToken = "plaintext-handoff-from-query-string";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const email = "athlete@example.test";
const claimedAt = new Date("2026-10-11T18:00:00.000Z");

function ssoRequest(token = rawToken) {
  const url = new URL("https://workouts.example.test/api/peptideos-wc-sso");
  url.searchParams.set("token", token);
  return new NextRequest(url);
}

test("409 collisions burn the handoff token", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const tokenHash = hashHandoffToken(rawToken);
    const handoff = { user_id: peptideosUserId, consumed_at: null as Date | null };
    const deps: PeptideOsSsoDeps = {
      claimByHash: async (hash: string): Promise<HandoffClaimRow[]> => {
        if (hash !== tokenHash || handoff.consumed_at) return [];
        handoff.consumed_at = claimedAt;
        return [{ user_id: handoff.user_id, consumed_at: claimedAt }];
      },
      lookupAuthUser: async (hid) => (hid === peptideosUserId ? { email, meta: { full_name: "Ada Athlete" } } : null),
      loadSsoAccountSnapshot: async () => ({ existingUser: null, peptideosAccountId: null }),
      findUserByEmail: async () => null,
      signUp: async () => {
        throw new Error(`User already exists: ${email}`);
      },
      createPeptideosAccount: async () => undefined,
      findPeptideosAccountByUserId: async () => null,
      createSignedSession: async () => ({ ok: false, wroteSession: false, response: null }),
      workoutOrigin: "https://workouts.example.test"
    };

    const response = await runPeptideOsSso(ssoRequest(), deps);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.deepEqual(body, { error: "sso_email_collision" });
    assert.equal(handoffDisposition(), "keep");
    assert.ok(handoff.consumed_at);

    const retry = await runPeptideOsSso(ssoRequest(), deps);
    assert.equal(retry.status, 400);
    assert.deepEqual(await retry.json(), { error: "invalid_or_expired_handoff" });
    assert.ok(handoff.consumed_at);
  } finally {
    console.error = original;
  }
});
