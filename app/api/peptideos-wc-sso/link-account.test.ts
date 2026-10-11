import { test } from "node:test";
import assert from "node:assert/strict";

import { createLinkAttemptLimiter } from "./link-rate-limit";
import { createLinkCookiePayload, serializeLinkCookie } from "./link-cookie";
import { PEPTIDEOS_LINK_GENERIC_ERROR, createLinkJtiStore, insertPeptideosAccountLink, linkPeptideosAccount } from "./link-account";

import type { LinkPeptideosDeps } from "./link-account";

const secret = "test-better-auth-secret";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const wcUserId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const now = 1_700_000_000_000;

async function signedCookie(overrides: Partial<Parameters<typeof createLinkCookiePayload>[0]> = {}) {
  const payload = createLinkCookiePayload({
    peptideosUserId,
    wcUserId,
    now,
    jti: "link-jti",
    ...overrides
  });
  const header = await serializeLinkCookie(payload, secret);
  return header.split(";")[0].slice("peptideos_link=".length);
}

function trackingDeps(overrides: Partial<LinkPeptideosDeps> = {}) {
  const calls: string[] = [];
  const jtiStore = createLinkJtiStore();
  const limiter = createLinkAttemptLimiter({ now: () => now });

  const deps: LinkPeptideosDeps = {
    now: () => now,
    secret,
    isJtiConsumed: (jti) => jtiStore.isConsumed(jti),
    consumeJti: (jti) => jtiStore.consume(jti),
    isRateLimited: (userId, ip) => limiter.isLimited(userId, ip),
    recordFailure: (userId, ip) => limiter.recordFailure(userId, ip),
    findUserById: async (id) => (id === wcUserId ? { id: wcUserId, email: "jane@example.com" } : null),
    verifyPassword: async (email, password) => {
      calls.push(`verifyPassword:${email}:${password}`);
      return email === "jane@example.com" && password === "correct-horse" ? { userId: wcUserId } : null;
    },
    linkAccount: async (input) => {
      calls.push(`linkAccount:${input.wcUserId}:${input.peptideosUserId}`);
      return "created";
    },
    createSignedSession: async (userId) => {
      calls.push(`createSignedSession:${userId}`);
      return true;
    },
    auditLog: (entry) => {
      calls.push(`audit:${entry.wcUserId}:${entry.peptideosUserId}`);
    },
    sendLinkedEmail: async (email) => {
      calls.push(`email:${email}`);
    },
    ...overrides
  };

  return { calls, deps, jtiStore, limiter };
}

test("success: verifies the password, inserts the peptideos row, signs a session, consumes the cookie, and audits", async () => {
  const cookieValue = await signedCookie();
  const { calls, deps, jtiStore } = trackingDeps();

  const result = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);

  assert.deepEqual(result, { ok: true, userId: wcUserId });
  assert.deepEqual(calls, [
    "verifyPassword:jane@example.com:correct-horse",
    `linkAccount:${wcUserId}:${peptideosUserId}`,
    `createSignedSession:${wcUserId}`,
    `audit:${wcUserId}:${peptideosUserId}`,
    "email:jane@example.com"
  ]);
  assert.equal(jtiStore.isConsumed("link-jti"), true);
});

test("wrong password returns a generic error and does not link", async () => {
  const cookieValue = await signedCookie();
  const { calls, deps } = trackingDeps();

  const result = await linkPeptideosAccount({ cookieValue, password: "nope", ip: "1.1.1.1" }, deps);

  assert.deepEqual(result, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
  assert.deepEqual(calls, ["verifyPassword:jane@example.com:nope"]);
});

test("mismatched authenticated user id does not link", async () => {
  const cookieValue = await signedCookie();
  const { calls, deps } = trackingDeps({
    verifyPassword: async () => ({ userId: "someone-else" })
  });

  const result = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);

  assert.deepEqual(result, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
  assert.ok(!calls.some((call) => call.startsWith("linkAccount")));
  assert.ok(!calls.some((call) => call.startsWith("createSignedSession")));
});

test("expired cookie is rejected without verifying the password", async () => {
  const cookieValue = await signedCookie();
  const { calls, deps } = trackingDeps({
    now: () => now + 10 * 60 * 1000 + 1
  });

  const result = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);

  assert.deepEqual(result, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
  assert.deepEqual(calls, []);
});

test("replayed cookie after a successful link is rejected", async () => {
  const cookieValue = await signedCookie();
  const { deps } = trackingDeps();

  const first = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);
  const replay = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);

  assert.equal(first.ok, true);
  assert.deepEqual(replay, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
});

test("rate limit lockout rejects further attempts without verifying the password", async () => {
  const cookieValue = await signedCookie();
  const { calls, deps } = trackingDeps();

  for (let i = 0; i < 5; i += 1) {
    const failed = await linkPeptideosAccount({ cookieValue, password: "wrong", ip: "1.1.1.1" }, deps);
    assert.equal(failed.ok, false);
  }

  const locked = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);
  assert.deepEqual(locked, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
  assert.ok(!calls.includes("verifyPassword:jane@example.com:correct-horse"));
  assert.ok(!calls.some((call) => call.startsWith("linkAccount")));
});

test("concurrent link: unique conflict for the same user is success; only one insert wins", async () => {
  const cookieA = await signedCookie({ jti: "jti-a" });
  const cookieB = await signedCookie({ jti: "jti-b" });
  let created = false;
  const { deps } = trackingDeps({
    linkAccount: async () => {
      if (created) return "already_linked";
      created = true;
      return "created";
    }
  });

  const [first, second] = await Promise.all([
    linkPeptideosAccount({ cookieValue: cookieA, password: "correct-horse", ip: "1.1.1.1" }, deps),
    linkPeptideosAccount({ cookieValue: cookieB, password: "correct-horse", ip: "2.2.2.2" }, deps)
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
});

test("unique conflict for a different user is a generic failure", async () => {
  const cookieValue = await signedCookie();
  const { deps } = trackingDeps({
    linkAccount: async () => "conflict"
  });

  const result = await linkPeptideosAccount({ cookieValue, password: "correct-horse", ip: "1.1.1.1" }, deps);
  assert.deepEqual(result, { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 });
});

test("insertPeptideosAccountLink treats a same-user unique race as already linked", async () => {
  let created = false;
  const resultA = await insertPeptideosAccountLink(
    {
      create: async () => {
        created = true;
      },
      findExisting: async () => null
    },
    { wcUserId, peptideosUserId, newId: "row-1", now: () => new Date(now) },
  );
  const resultB = await insertPeptideosAccountLink(
    {
      create: async () => {
        const error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        throw error;
      },
      findExisting: async () => ({ userId: wcUserId })
    },
    { wcUserId, peptideosUserId, newId: "row-2", now: () => new Date(now) },
  );
  const resultC = await insertPeptideosAccountLink(
    {
      create: async () => {
        const error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        throw error;
      },
      findExisting: async () => ({ userId: "other-user" })
    },
    { wcUserId, peptideosUserId, newId: "row-3", now: () => new Date(now) },
  );

  assert.equal(created, true);
  assert.equal(resultA, "created");
  assert.equal(resultB, "already_linked");
  assert.equal(resultC, "conflict");
});
