import { test } from "node:test";
import assert from "node:assert/strict";

import { completePeptideOsSsoLogin } from "./complete-sso";

const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function trackingDeps(overrides: Partial<Parameters<typeof completePeptideOsSsoLogin>[2]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      findUserByEmail: async () => null,
      signUp: async () => {
        calls.push("signUp");
        return { userId: "new-user" };
      },
      createPeptideosAccount: async (userId: string) => {
        calls.push(`createPeptideosAccount:${userId}`);
      },
      createSignedSession: async (userId: string) => {
        calls.push(`createSignedSession:${userId}`);
        return { ok: true, wroteSession: true };
      },
      ...overrides
    }
  };
}

test("new PeptideOS user signs up with a random unused password path and a signed session", async () => {
  let finds = 0;
  const { calls, deps } = trackingDeps({
    findUserByEmail: async () => {
      finds += 1;
      return finds === 1 ? null : { id: "new-user" };
    }
  });

  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: null, peptideosAccountId: null },
    deps,
  );

  assert.deepEqual(result, { ok: true, userId: "new-user", wroteUserState: true });
  assert.deepEqual(calls, ["signUp", "createPeptideosAccount:new-user", "createSignedSession:new-user"]);
});

test("email collision does not create a peptideos link or session", async () => {
  const { calls, deps } = trackingDeps();
  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: { id: "victim" }, peptideosAccountId: null },
    deps,
  );

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409, wroteUserState: false });
  assert.deepEqual(calls, []);
});

test("create_user race that surfaces an existing email returns 409 and writes nothing", async () => {
  const { calls, deps } = trackingDeps({
    findUserByEmail: async () => ({ id: "google-only-victim" }),
    signUp: async () => ({ userId: "should-not-be-used" })
  });

  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: null, peptideosAccountId: null },
    deps,
  );

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409, wroteUserState: false });
  assert.ok(!calls.includes("createPeptideosAccount:google-only-victim"));
  assert.ok(!calls.includes("createPeptideosAccount:should-not-be-used"));
});

test("cookie failure after createSession marks wroteUserState so the handoff is not released", async () => {
  const { calls, deps } = trackingDeps({
    createSignedSession: async (userId: string) => {
      calls.push(`createSignedSession:${userId}`);
      return { ok: false, wroteSession: true };
    }
  });

  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: { id: "wc-user" }, peptideosAccountId: peptideosUserId },
    deps,
  );

  assert.deepEqual(result, { ok: false, error: "sso_signin_failed", status: 500, wroteUserState: true });
  assert.deepEqual(calls, ["createSignedSession:wc-user"]);
});

test("peptideos account unique violation after signup is a 409 collision, not a 500", async () => {
  let finds = 0;
  const { calls, deps } = trackingDeps({
    findUserByEmail: async () => {
      finds += 1;
      return finds === 1 ? null : { id: "new-user" };
    },
    createPeptideosAccount: async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    }
  });

  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: null, peptideosAccountId: null },
    deps
  );

  assert.deepEqual(result, { ok: false, error: "sso_email_collision", status: 409, wroteUserState: true });
  assert.deepEqual(calls, ["signUp"]);
});

test("linked PeptideOS identity signs in with a signed session and never touches credentials", async () => {
  const { calls, deps } = trackingDeps();
  const result = await completePeptideOsSsoLogin(
    peptideosUserId,
    { existingUser: { id: "wc-user" }, peptideosAccountId: peptideosUserId },
    deps,
  );

  assert.deepEqual(result, { ok: true, userId: "wc-user", wroteUserState: true });
  assert.deepEqual(calls, ["createSignedSession:wc-user"]);
});
