import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsSso } from "./run-sso";
import { hashHandoffToken } from "./hash-handoff-token";
import { attachTrustedSession } from "./attach-trusted-session";

import type { PeptideOsSsoDeps } from "./run-sso";
import type { SsoAccountSnapshot } from "./resolve-sso-account";
import type { HandoffClaimRow } from "./consume-handoff";

const rawToken = "plaintext-handoff-from-query-string";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const email = "athlete@example.test";
const claimedAt = new Date("2026-10-11T18:00:00.000Z");

interface FakeHandoff {
  user_id: string;
  consumed_at: Date | null;
}

function ssoRequest(token = rawToken) {
  return new NextRequest(`https://workouts.example.test/api/peptideos-wc-sso?token=${token}`);
}

function fakeWorld(overrides: {
  snapshot?: SsoAccountSnapshot;
  signUp?: PeptideOsSsoDeps["signUp"];
  createSignedSession?: PeptideOsSsoDeps["createSignedSession"];
  lookupAuthUser?: PeptideOsSsoDeps["lookupAuthUser"];
} = {}) {
  const tokenHash = hashHandoffToken(rawToken);
  const handoff: FakeHandoff = { user_id: peptideosUserId, consumed_at: null };
  const released: Array<{ hash: string; at: Date }> = [];
  const accounts: Array<{ userId: string; peptideosUserId: string }> = [];
  const deletedSessions: string[] = [];

  const claimByHash = async (hash: string): Promise<HandoffClaimRow[]> => {
    if (hash !== tokenHash || handoff.consumed_at) return [];
    handoff.consumed_at = claimedAt;
    return [{ user_id: handoff.user_id, consumed_at: claimedAt }];
  };

  const defaultSession: PeptideOsSsoDeps["createSignedSession"] = async (userId) =>
    attachTrustedSession(userId, {
      findUserById: async (id) => ({ id }),
      createSession: async () => {
        const token = `sess-${userId}`;
        return {
          id: `id-${userId}`,
          token,
          userId,
          expiresAt: new Date("2026-11-11T00:00:00.000Z"),
          createdAt: claimedAt,
          updatedAt: claimedAt
        };
      },
      deleteSession: async (token) => {
        deletedSessions.push(token);
      },
      setSessionCookie: async (ctx) => {
        await ctx.setSignedCookie("better-auth.session_token", `sess-${userId}`, "test-secret", {
          path: "/",
          httpOnly: true,
          sameSite: "lax"
        });
      }
    });

  const deps: PeptideOsSsoDeps = {
    claimByHash,
    releaseByHash: async (hash, at) => {
      released.push({ hash, at });
      if (hash === tokenHash && handoff.consumed_at?.getTime() === at.getTime()) {
        handoff.consumed_at = null;
      }
    },
    lookupAuthUser:
      overrides.lookupAuthUser ??
      (async (hid) => (hid === peptideosUserId ? { email, meta: { full_name: "Ada Athlete" } } : null)),
    loadSsoAccountSnapshot: async () => overrides.snapshot ?? { existingUser: null, peptideosAccountId: null },
    findUserByEmail: async () =>
      overrides.snapshot?.existingUser ?? (overrides.signUp ? null : null),
    signUp:
      overrides.signUp ??
      (async () => ({ userId: "new-user" })),
    createPeptideosAccount: async (userId, hid) => {
      accounts.push({ userId, peptideosUserId: hid });
    },
    createSignedSession: overrides.createSignedSession ?? defaultSession,
    workoutOrigin: "https://workouts.example.test"
  };

  if (!overrides.snapshot?.existingUser && !overrides.signUp) {
    let finds = 0;
    deps.findUserByEmail = async () => {
      finds += 1;
      return finds === 1 ? null : { id: "new-user" };
    };
  } else if (overrides.snapshot?.existingUser) {
    deps.findUserByEmail = async () => overrides.snapshot?.existingUser ?? null;
  }

  return { deps, handoff, released, accounts, deletedSessions, tokenHash };
}

test("new PeptideOS user: consume, create user, session, and signed cookie; token stays consumed", async () => {
  const { deps, handoff, released, accounts } = fakeWorld();

  const response = await runPeptideOsSso(ssoRequest(), deps);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://workouts.example.test/");
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
  assert.ok(handoff.consumed_at);
  assert.deepEqual(released, []);
  assert.deepEqual(accounts, [{ userId: "new-user", peptideosUserId }]);
});

test("linked PeptideOS user: consume, skip signup, session, and signed cookie", async () => {
  const { deps, released, accounts } = fakeWorld({
    snapshot: { existingUser: { id: "wc-user" }, peptideosAccountId: peptideosUserId }
  });

  const response = await runPeptideOsSso(ssoRequest(), deps);

  assert.equal(response.status, 307);
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
  assert.deepEqual(accounts, []);
  assert.deepEqual(released, []);
});

test("email collision returns a generic 409 and burns the handoff", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };

  try {
    const { deps, handoff, released, accounts } = fakeWorld({
      snapshot: { existingUser: null, peptideosAccountId: null },
      signUp: async () => {
        throw new Error("User already exists: athlete@example.test");
      }
    });
    deps.findUserByEmail = async () => null;

    const response = await runPeptideOsSso(ssoRequest(), deps);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.deepEqual(body, { error: "sso_email_collision" });
    assert.ok(handoff.consumed_at);
    assert.deepEqual(released, []);
    assert.deepEqual(accounts, []);
    assert.match(lines.join("\n"), /sso_email_collision/);
    assert.doesNotMatch(lines.join("\n"), /athlete@example.test/);
  } finally {
    console.error = original;
  }
});

test("cookie failure after createSession cleans up the session and does not release the handoff", async () => {
  const { deps, handoff, released, deletedSessions } = fakeWorld({
    snapshot: { existingUser: { id: "wc-user" }, peptideosAccountId: peptideosUserId },
    createSignedSession: async (userId) =>
      attachTrustedSession(userId, {
        findUserById: async (id) => ({ id }),
        createSession: async () => ({
          id: "sess-1",
          token: "orphaned-session-token",
          userId,
          expiresAt: new Date("2026-11-11T00:00:00.000Z"),
          createdAt: claimedAt,
          updatedAt: claimedAt
        }),
        deleteSession: async (token) => {
          deletedSessions.push(token);
        },
        setSessionCookie: async () => {
          throw new Error("setSessionCookie exploded");
        }
      })
  });

  const response = await runPeptideOsSso(ssoRequest(), deps);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "sso_signin_failed" });
  assert.ok(handoff.consumed_at);
  assert.deepEqual(released, []);
  assert.deepEqual(deletedSessions, ["orphaned-session-token"]);
});

test("createSession throw after persist does not release the handoff", async () => {
  const { deps, handoff, released } = fakeWorld({
    snapshot: { existingUser: { id: "wc-user" }, peptideosAccountId: peptideosUserId },
    createSignedSession: async (userId) =>
      attachTrustedSession(userId, {
        findUserById: async (id) => ({ id }),
        createSession: async () => {
          throw new Error("session hook failed after insert");
        },
        deleteSession: async () => undefined,
        setSessionCookie: async () => undefined
      })
  });

  const response = await runPeptideOsSso(ssoRequest(), deps);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "sso_signin_failed" });
  assert.ok(handoff.consumed_at);
  assert.deepEqual(released, []);
});

test("auth.users lookup failure before any write releases the single-use claim", async () => {
  const { deps, handoff, released } = fakeWorld({
    lookupAuthUser: async () => {
      throw Object.assign(new Error("relation auth.users does not exist"), { code: "42P01" });
    }
  });

  const response = await runPeptideOsSso(ssoRequest(), deps);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "auth_users_lookup_failed");
  assert.equal(handoff.consumed_at, null);
  assert.deepEqual(released, [{ hash: hashHandoffToken(rawToken), at: claimedAt }]);
});
