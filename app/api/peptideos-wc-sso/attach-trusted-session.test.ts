import { test } from "node:test";
import assert from "node:assert/strict";

import { attachTrustedSession } from "./attach-trusted-session";

const session = {
  id: "sess-1",
  token: "session-token-plain",
  userId: "wc-user",
  expiresAt: new Date("2026-11-11T00:00:00.000Z"),
  createdAt: new Date("2026-10-11T00:00:00.000Z"),
  updatedAt: new Date("2026-10-11T00:00:00.000Z")
};

test("returns a response with set-cookie when createSession and cookie write succeed", async () => {
  const deleted: string[] = [];
  const result = await attachTrustedSession("wc-user", {
    findUserById: async (userId) => ({ id: userId }),
    createSession: async () => session,
    deleteSession: async (token) => {
      deleted.push(token);
    },
    setSessionCookie: async (ctx) => {
      await ctx.setSignedCookie("better-auth.session_token", session.token, "test-secret", { path: "/" });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.wroteSession, true);
  assert.ok(result.response);
  const cookie = result.response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /better-auth\.session_token=/);
  assert.doesNotMatch(cookie, /session_token=session-token-plain(?:;|$)/);
  assert.deepEqual(deleted, []);
});

test("deletes the orphaned session and reports a write when setSessionCookie throws", async () => {
  const deleted: string[] = [];
  const result = await attachTrustedSession("wc-user", {
    findUserById: async (userId) => ({ id: userId }),
    createSession: async () => session,
    deleteSession: async (token) => {
      deleted.push(token);
    },
    setSessionCookie: async () => {
      throw new Error("cookie signing failed");
    }
  });

  assert.deepEqual(result, { ok: false, wroteSession: true, response: null });
  assert.deepEqual(deleted, ["session-token-plain"]);
});

test("treats a missing set-cookie header as a cookie failure after the session write", async () => {
  const deleted: string[] = [];
  const result = await attachTrustedSession("wc-user", {
    findUserById: async (userId) => ({ id: userId }),
    createSession: async () => session,
    deleteSession: async (token) => {
      deleted.push(token);
    },
    setSessionCookie: async () => undefined
  });

  assert.deepEqual(result, { ok: false, wroteSession: true, response: null });
  assert.deepEqual(deleted, ["session-token-plain"]);
});

test("treats a createSession throw as a write so the handoff cannot be released", async () => {
  const result = await attachTrustedSession("wc-user", {
    findUserById: async (userId) => ({ id: userId }),
    createSession: async () => {
      throw new Error("hook after adapter.create");
    },
    deleteSession: async () => {
      throw new Error("no token to delete");
    },
    setSessionCookie: async () => {
      throw new Error("should not set cookie");
    }
  });

  assert.deepEqual(result, { ok: false, wroteSession: true, response: null });
});

test("does not report a write when createSession never persists a session", async () => {
  const result = await attachTrustedSession("wc-user", {
    findUserById: async (userId) => ({ id: userId }),
    createSession: async () => null,
    deleteSession: async () => {
      throw new Error("should not delete");
    },
    setSessionCookie: async () => {
      throw new Error("should not set cookie");
    }
  });

  assert.deepEqual(result, { ok: false, wroteSession: false, response: null });
});
