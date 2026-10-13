import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";

import {
  EMBED_REJECT_PEEK_MAX_BYTES,
  SSO_POST_MAX_BYTES,
  isExactPeptideOsSsoOrigin,
  runPeptideOsSsoPost,
  ssoHeadNotAllowed,
  ssoMethodNotAllowed
} from "./run-sso";
import { hashHandoffToken } from "./hash-handoff-token";
import { attachTrustedSession } from "./attach-trusted-session";

import type { PeptideOsSsoDeps } from "./run-sso";
import type { SsoAccountSnapshot } from "./resolve-sso-account";
import type { HandoffClaimRow } from "./consume-handoff";

const POS = "https://peptideos.us";
const WC = "https://workouts.example.test";
const rawToken = "plaintext-handoff-from-form-body";
const peptideosUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const email = "athlete@example.test";
const claimedAt = new Date("2026-10-11T18:00:00.000Z");

interface FakeHandoff {
  user_id: string;
  consumed_at: Date | null;
  expires_at: Date;
}

function assertSsoResponseHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

function postRequest(options: {
  token?: string;
  redirect?: string;
  returnTo?: string;
  origin?: string | null;
  contentType?: string | null;
  accept?: string;
  cookie?: string;
  referer?: string;
  queryToken?: string;
  queryReturn?: string;
  rawBody?: string;
  contentLength?: string;
}) {
  const url = new URL(`${WC}/api/peptideos-wc-sso`);
  if (options.queryToken) url.searchParams.set("token", options.queryToken);
  if (options.queryReturn) url.searchParams.set("return", options.queryReturn);
  const params = new URLSearchParams();
  if (options.token !== undefined) params.set("token", options.token);
  if (options.redirect !== undefined) params.set("redirect", options.redirect);
  if (options.returnTo !== undefined) params.set("return", options.returnTo);
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? POS);
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/x-www-form-urlencoded");
  }
  headers.set("accept", options.accept ?? "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.referer) headers.set("referer", options.referer);
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  const body = options.rawBody ?? params.toString();
  return new NextRequest(url, { method: "POST", headers, body });
}

function fakeWorld(overrides: {
  expiresAt?: Date;
  snapshot?: SsoAccountSnapshot;
  signUp?: PeptideOsSsoDeps["signUp"];
} = {}) {
  const tokenHash = hashHandoffToken(rawToken);
  const handoff: FakeHandoff = {
    user_id: peptideosUserId,
    consumed_at: null,
    expires_at: overrides.expiresAt ?? new Date(claimedAt.getTime() + 120_000)
  };
  let claims = 0;
  const seenSignUpHeaders: Headers[] = [];

  const claimByHash = async (hash: string): Promise<HandoffClaimRow[]> => {
    claims += 1;
    if (hash !== tokenHash || handoff.consumed_at || handoff.expires_at.getTime() <= claimedAt.getTime()) return [];
    handoff.consumed_at = claimedAt;
    return [{ user_id: handoff.user_id, consumed_at: claimedAt }];
  };

  const createSignedSession: PeptideOsSsoDeps["createSignedSession"] = async (userId) =>
    attachTrustedSession(userId, {
      findUserById: async (id) => ({ id }),
      createSession: async () => ({
        id: `id-${userId}`,
        token: `sess-${userId}`,
        userId,
        expiresAt: new Date("2026-11-11T00:00:00.000Z"),
        createdAt: claimedAt,
        updatedAt: claimedAt
      }),
      deleteSession: async () => undefined,
      setSessionCookie: async (ctx) => {
        await ctx.setSignedCookie("better-auth.session_token", `sess-${userId}`, "test-secret", {
          path: "/",
          httpOnly: true,
          sameSite: "lax"
        });
      }
    });

  let finds = 0;
  const deps: PeptideOsSsoDeps = {
    claimByHash,
    lookupAuthUser: async (hid) => (hid === peptideosUserId ? { email, meta: { full_name: "Ada Athlete" } } : null),
    loadSsoAccountSnapshot: async () => overrides.snapshot ?? { existingUser: null, peptideosAccountId: null },
    findUserByEmail: async () => {
      if (overrides.snapshot?.existingUser) return overrides.snapshot.existingUser;
      finds += 1;
      return finds === 1 ? null : { id: "new-user" };
    },
    signUp:
      overrides.signUp ??
      (async ({ headers }) => {
        seenSignUpHeaders.push(headers);
        return { userId: "new-user" };
      }),
    createPeptideosAccount: async () => undefined,
    findPeptideosAccountByUserId: async () => null,
    createSignedSession,
    workoutOrigin: WC
  };

  return { deps, handoff, seenSignUpHeaders, claimCount: () => claims };
}

test("PeptideOS origin match is exact, including a missing Origin", () => {
  assert.equal(isExactPeptideOsSsoOrigin(POS, POS), true);
  assert.equal(isExactPeptideOsSsoOrigin(null, POS), false);
  assert.equal(isExactPeptideOsSsoOrigin("", POS), false);
  assert.equal(isExactPeptideOsSsoOrigin("https://www.peptideos.us", POS), false);
  assert.equal(isExactPeptideOsSsoOrigin(`${POS}/`, POS), false);
  assert.equal(isExactPeptideOsSsoOrigin("https://peptideos.us.evil.test", POS), false);
  assert.equal(isExactPeptideOsSsoOrigin(WC, POS), false);
});

test("POST success consumes the handoff, sets a session, and does not store or refer", async () => {
  const { deps, handoff, seenSignUpHeaders, claimCount } = fakeWorld();
  const dest = `${WC}/en/profile?tab=history`;
  const response = await runPeptideOsSsoPost(
    postRequest({
      token: rawToken,
      redirect: dest,
      cookie: "detected-locale=en",
      referer: `${POS}/workouts`
    }),
    deps,
    POS
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), dest);
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
  assertSsoResponseHeaders(response);
  assert.ok(handoff.consumed_at);
  assert.equal(claimCount(), 1);
  assert.equal(seenSignUpHeaders.length, 1);
  assert.equal(seenSignUpHeaders[0]?.get("cookie"), "detected-locale=en");
  assert.equal(seenSignUpHeaders[0]?.get("origin"), POS);
});

const DASHBOARD = "https://peptideos.us/workouts";
const DASHBOARD_WWW = "https://www.peptideos.us/workouts";

test("POST return field sends the browser to the exact PeptideOS workouts page", async () => {
  const dest = `${WC}/en/profile?tab=history`;
  for (const returnTo of [DASHBOARD, DASHBOARD_WWW]) {
    const { deps } = fakeWorld();
    const response = await runPeptideOsSsoPost(
      postRequest({ token: rawToken, redirect: dest, returnTo }),
      deps,
      POS
    );
    assert.equal(response.status, 303, returnTo);
    assert.notEqual(response.status, 302, returnTo);
    assert.equal(response.headers.get("location"), returnTo);
    assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
    assertSsoResponseHeaders(response);
    assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'self' https://peptideos.us https://www.peptideos.us");
  }
});

test("POST rejects every non-exact return and falls back to the in-app redirect", async () => {
  const dest = `${WC}/en/profile`;
  const rejected = [
    "",
    "https://peptideos.us/workouts?next=1",
    "https://peptideos.us/workouts#evil",
    "https://peptideos.us/workouts/",
    "https://peptideos.us/workouts/extra",
    "https://peptideos.us/workouts.evil.example",
    "http://peptideos.us/workouts",
    "https://peptideos.us:443/workouts",
    "https://evil.example/workouts",
    "https://peptideos.us.evil.test/workouts",
    "https://evil@peptideos.us/workouts",
    "//peptideos.us/workouts",
    "https://peptideos.us//workouts",
    "/workouts",
    "https://peptideos.us/workouts/../admin",
    "https://peptideos.us/workouts%2F%2Fevil.com",
    "https://peptideos.us/workouts%252F%252Fevil.com",
    "https://peptideos.us/%2F%2Fevil.com",
    "https://peptideos.us/workouts%5C%5Cevil.com",
    "https://peptideos.us\\@evil.com/workouts",
    "https://peptideos.us/workouts\nhttps://evil.example",
    "https://peptideos.us/workouts\u0000",
    "https://www.peptideos.us/workouts/extra",
    "https://www.peptideos.us/workouts?x=1",
    "http://www.peptideos.us/workouts",
    "https://www.peptideos.us//workouts",
    "//www.peptideos.us/workouts",
    " https://peptideos.us/workouts",
    "https://peptideos.us/workouts "
  ];

  for (const returnTo of rejected) {
    const { deps } = fakeWorld();
    const response = await runPeptideOsSsoPost(
      postRequest({ token: rawToken, redirect: dest, returnTo }),
      deps,
      POS
    );
    assert.equal(response.status, 303, JSON.stringify(returnTo));
    assert.equal(response.headers.get("location"), dest, JSON.stringify(returnTo));
    assert.doesNotMatch(response.headers.get("location") ?? "", /evil|peptideos\.us\/workouts/, JSON.stringify(returnTo));
  }
});

test("POST encoded return tricks in the raw body do not match the dashboard URL", async () => {
  const dest = `${WC}/en/profile`;
  const encoded = [
    "return=https%3A%2F%2Fpeptideos.us%2Fworkouts%2F%2Fevil.com",
    "return=https%3A%2F%2Fpeptideos.us%2F%2Fworkouts",
    "return=%2F%2Fpeptideos.us%2Fworkouts",
    "return=https%3A%2F%2Fpeptideos.us%2Fworkouts%3Fnext%3D1",
    "return=https%3A%2F%2Fevil.example%2Fworkouts&return=https%3A%2F%2Fpeptideos.us%2Fworkouts"
  ];
  for (const returnField of encoded) {
    const { deps } = fakeWorld();
    const response = await runPeptideOsSsoPost(
      postRequest({
        redirect: dest,
        rawBody: `token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(dest)}&${returnField}`
      }),
      deps,
      POS
    );
    assert.equal(response.status, 303, returnField);
    assert.equal(response.headers.get("location"), dest, returnField);
  }
});

test("a missing return keeps the in-app redirect, and a query return is ignored", async () => {
  const dest = `${WC}/en/profile`;
  const missing = fakeWorld();
  const withoutReturn = await runPeptideOsSsoPost(postRequest({ token: rawToken, redirect: dest }), missing.deps, POS);
  assert.equal(withoutReturn.status, 303);
  assert.equal(withoutReturn.headers.get("location"), dest);

  const fromQuery = fakeWorld();
  const queryOnly = await runPeptideOsSsoPost(
    postRequest({
      token: rawToken,
      redirect: dest,
      queryReturn: DASHBOARD
    }),
    fromQuery.deps,
    POS
  );
  assert.equal(queryOnly.status, 303);
  assert.equal(queryOnly.headers.get("location"), dest);

  const bodyWins = fakeWorld();
  const overridden = await runPeptideOsSsoPost(
    postRequest({
      token: rawToken,
      redirect: dest,
      returnTo: DASHBOARD,
      queryReturn: "https://evil.example/phish"
    }),
    bodyWins.deps,
    POS
  );
  assert.equal(overridden.status, 303);
  assert.equal(overridden.headers.get("location"), DASHBOARD);
});

test("POST drops an untrusted redirect and fails closed to the workout origin", async () => {
  const { deps } = fakeWorld();
  const response = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, redirect: "https://evil.example/phish" }),
    deps,
    POS
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${WC}/`);
  assertSsoResponseHeaders(response);
});

test("a wrong or missing Origin is 403, redacted, and does not consume the token", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    for (const origin of [null, "https://evil.example", "https://www.peptideos.us", `${POS}/`] as const) {
      const { deps, handoff, claimCount } = fakeWorld();
      const response = await runPeptideOsSsoPost(
        postRequest({ token: rawToken, origin, accept: "application/json" }),
        deps,
        POS
      );
      assert.equal(response.status, 403, String(origin));
      assert.deepEqual(await response.json(), { error: "forbidden_origin" });
      assertSsoResponseHeaders(response);
      assert.equal(handoff.consumed_at, null);
      assert.equal(claimCount(), 0);
    }

    const { deps } = fakeWorld();
    const html = await runPeptideOsSsoPost(
      postRequest({ token: rawToken, origin: "https://evil.example", accept: "text/html" }),
      deps,
      POS
    );
    const page = await html.text();
    assert.equal(html.status, 403);
    assert.match(html.headers.get("content-type") ?? "", /text\/html/);
    assertSsoResponseHeaders(html);
    assert.doesNotMatch(page, /plaintext-handoff-from-form-body/);
    assert.doesNotMatch(page, /forbidden_origin/);
    assert.doesNotMatch(`${page}\n${lines.join("\n")}`, /plaintext-handoff-from-form-body/);
    assert.doesNotMatch(page, /← Back to dashboard/);
    assert.doesNotMatch(page, /target="_top"/);
  } finally {
    console.error = original;
  }
});

test("embed forbidden_origin and SSO errors show top-level Log in and Sign up", async () => {
  const { deps } = fakeWorld();
  const forbidden = await runPeptideOsSsoPost(
    postRequest({
      token: rawToken,
      origin: "https://evil.example",
      accept: "text/html",
      rawBody: `token=${encodeURIComponent(rawToken)}&embed=1`
    }),
    deps,
    POS
  );
  const forbiddenPage = await forbidden.text();
  assert.equal(forbidden.status, 403);
  assert.match(forbiddenPage, />Log in</);
  assert.match(forbiddenPage, />Sign up</);
  assert.match(forbiddenPage, /← Back to dashboard/);
  assert.match(forbiddenPage, /target="_top"/);
  assert.doesNotMatch(forbiddenPage, /plaintext-handoff-from-form-body/);
  assert.doesNotMatch(forbiddenPage, /forbidden_origin/);

  const { deps: missingDeps } = fakeWorld();
  const missing = await runPeptideOsSsoPost(
    postRequest({
      token: "",
      accept: "text/html",
      referer: `${POS}/api/workouts/sso?embed=1`
    }),
    missingDeps,
    POS
  );
  const missingPage = await missing.text();
  assert.equal(missing.status, 400);
  assert.match(missingPage, />Log in</);
  assert.match(missingPage, /target="_top"/);
  assert.match(missingPage, /← Back to dashboard/);
});

test("forbidden_origin embed peek uses the query first and caps the body", async () => {
  let queryPulls = 0;
  const queryChunks = Array.from({ length: 6 }, () => new Uint8Array(1024));
  const fromQuery = await runPeptideOsSsoPost(
    peekRequest({
      search: "?embed=1",
      contentType: "application/json",
      chunks: queryChunks,
      onPull: () => {
        queryPulls += 1;
      }
    }),
    fakeWorld().deps,
    POS
  );
  const queryPage = await fromQuery.text();
  assert.equal(fromQuery.status, 403);
  assert.ok(queryPulls < queryChunks.length);
  assert.match(queryPage, /← Back to dashboard/);
  assert.doesNotMatch(queryPage, new RegExp(rawToken));

  const small = await runPeptideOsSsoPost(
    peekRequest({
      chunks: [new TextEncoder().encode(`token=${encodeURIComponent(rawToken)}&embed=1`)]
    }),
    fakeWorld().deps,
    POS
  );
  const smallPage = await small.text();
  assert.match(smallPage, />Log in</);
  assert.match(smallPage, /target="_top"/);
  assert.doesNotMatch(smallPage, new RegExp(rawToken));

  let oversizePulls = 0;
  const declared = await runPeptideOsSsoPost(
    peekRequest({
      contentLength: String(EMBED_REJECT_PEEK_MAX_BYTES + 1),
      chunks: [new TextEncoder().encode(`embed=1&token=${encodeURIComponent(rawToken)}`)],
      onPull: () => {
        oversizePulls += 1;
      }
    }),
    fakeWorld().deps,
    POS
  );
  const declaredPage = await declared.text();
  assert.ok(oversizePulls < 2);
  assert.doesNotMatch(declaredPage, /← Back to dashboard/);
  assert.doesNotMatch(declaredPage, /target="_top"/);
  assert.doesNotMatch(declaredPage, new RegExp(rawToken));

  const wrongType = await runPeptideOsSsoPost(
    peekRequest({
      contentType: "application/json",
      chunks: [new TextEncoder().encode("{\"embed\":\"1\"}")]
    }),
    fakeWorld().deps,
    POS
  );
  assert.doesNotMatch(await wrongType.text(), /← Back to dashboard/);

  let streamed = 0;
  const chunks = Array.from({ length: 12 }, () => new Uint8Array(1024));
  chunks[0].set(new TextEncoder().encode("embed=1&"));
  const streamedResponse = await runPeptideOsSsoPost(
    peekRequest({
      chunks,
      onPull: (bytes) => {
        streamed += bytes;
      }
    }),
    fakeWorld().deps,
    POS
  );
  const streamedPage = await streamedResponse.text();
  assert.ok(streamed <= EMBED_REJECT_PEEK_MAX_BYTES + 1024);
  assert.ok(streamed < chunks.length * 1024);
  assert.doesNotMatch(streamedPage, /← Back to dashboard/);
});

test("POST replay of a consumed handoff fails and stays consumed", async () => {
  const { deps, handoff } = fakeWorld();
  const first = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
  assert.equal(first.status, 303);
  assert.ok(handoff.consumed_at);

  const replay = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: "invalid_or_expired_handoff" });
  assertSsoResponseHeaders(replay);
  assert.ok(handoff.consumed_at);
});

test("a reused handoff token does not create a second session", async () => {
  const world = fakeWorld();
  let sessions = 0;
  const createSignedSession = world.deps.createSignedSession;
  world.deps.createSignedSession = async (userId) => {
    sessions += 1;
    return createSignedSession(userId);
  };

  const first = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, returnTo: DASHBOARD }),
    world.deps,
    POS
  );
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("location"), DASHBOARD);
  assert.equal(sessions, 1);
  assert.equal(world.claimCount(), 1);

  const replay = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, returnTo: DASHBOARD }),
    world.deps,
    POS
  );
  assert.equal(replay.status, 400);
  assert.notEqual(replay.status, 500);
  assert.equal(replay.headers.get("location"), null);
  assert.equal(replay.headers.get("set-cookie"), null);
  assert.deepEqual(await replay.json(), { error: "invalid_or_expired_handoff" });
  assertSsoResponseHeaders(replay);
  assert.equal(sessions, 1);
  assert.equal(world.claimCount(), 2);
  assert.ok(world.handoff.consumed_at);

  const htmlReplay = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, accept: "text/html", returnTo: DASHBOARD }),
    world.deps,
    POS
  );
  assert.equal(htmlReplay.status, 400);
  assert.match(htmlReplay.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(htmlReplay.headers.get("location"), null);
  const page = await htmlReplay.text();
  assert.doesNotMatch(page, new RegExp(rawToken));
  assert.equal(sessions, 1);
});

test("double-submit of one handoff creates a single session", async () => {
  const world = fakeWorld();
  let sessions = 0;
  const createSignedSession = world.deps.createSignedSession;
  world.deps.createSignedSession = async (userId) => {
    sessions += 1;
    return createSignedSession(userId);
  };

  const [first, second] = await Promise.all([
    runPeptideOsSsoPost(postRequest({ token: rawToken, returnTo: DASHBOARD }), world.deps, POS),
    runPeptideOsSsoPost(postRequest({ token: rawToken, returnTo: DASHBOARD }), world.deps, POS)
  ]);
  const statuses = [first.status, second.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [303, 400]);
  assert.equal(sessions, 1);
  assert.equal(world.claimCount(), 2);

  const failed = first.status === 400 ? first : second;
  const succeeded = first.status === 303 ? first : second;
  assert.equal(succeeded.headers.get("location"), DASHBOARD);
  assert.equal(failed.headers.get("location"), null);
  assert.equal(failed.headers.get("set-cookie"), null);
  assert.deepEqual(await failed.json(), { error: "invalid_or_expired_handoff" });
  assert.notEqual(failed.status, 500);
});

test("an expired handoff fails and is not consumed", async () => {
  const { deps, handoff, claimCount } = fakeWorld({ expiresAt: new Date(claimedAt.getTime() - 1_000) });
  const response = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_or_expired_handoff" });
  assertSsoResponseHeaders(response);
  assert.equal(handoff.consumed_at, null);
  assert.equal(claimCount(), 1);
});

test("POST ignores a query-string token", async () => {
  const queryOnly = fakeWorld();
  const fromQuery = await runPeptideOsSsoPost(
    postRequest({ queryToken: rawToken, redirect: "/en/profile" }),
    queryOnly.deps,
    POS
  );
  assert.equal(fromQuery.status, 400);
  assert.deepEqual(await fromQuery.json(), { error: "missing_token" });
  assert.equal(queryOnly.handoff.consumed_at, null);
  assert.equal(queryOnly.claimCount(), 0);
  assertSsoResponseHeaders(fromQuery);
});

test("application/json Content-Type returns 415 and does not consume the handoff", async () => {
  const world = fakeWorld();
  const response = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, contentType: "application/json" }),
    world.deps,
    POS
  );
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
  assert.equal(world.handoff.consumed_at, null);
  assert.equal(world.claimCount(), 0);
});

test("application/x-www-form-urlencodedx returns 415 and does not consume the handoff", async () => {
  const world = fakeWorld();
  const response = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, contentType: "application/x-www-form-urlencodedx" }),
    world.deps,
    POS
  );
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
  assert.equal(world.handoff.consumed_at, null);
  assert.equal(world.claimCount(), 0);
});

test("a missing Content-Type returns 415 and does not consume the handoff", async () => {
  const world = fakeWorld();
  const response = await runPeptideOsSsoPost(postRequest({ token: rawToken, contentType: null }), world.deps, POS);
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
  assert.equal(world.handoff.consumed_at, null);
  assert.equal(world.claimCount(), 0);
});

test("urlencoded Content-Type with charset and a valid body is accepted", async () => {
  const world = fakeWorld();
  const response = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, contentType: "application/x-www-form-urlencoded; charset=UTF-8" }),
    world.deps,
    POS
  );
  assert.equal(response.status, 303);
  assert.equal(await response.text(), "");
  assert.ok(world.handoff.consumed_at);
});

function assertRejectedWithoutConsume(
  response: Response,
  status: number,
  handoff: FakeHandoff,
  claimCount: () => number
) {
  assert.equal(response.status, status);
  assertSsoResponseHeaders(response);
  assert.equal(handoff.consumed_at, null);
  assert.equal(claimCount(), 0);
}

function peekRequest(options: {
  chunks: Uint8Array[];
  search?: string;
  contentType?: string;
  contentLength?: string;
  onPull?: (bytes: number) => void;
}) {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= options.chunks.length) {
        controller.close();
        return;
      }
      const next = options.chunks[index];
      index += 1;
      options.onPull?.(next.byteLength);
      controller.enqueue(next);
    }
  });
  const headers = new Headers({
    origin: "https://evil.example",
    accept: "text/html",
    "content-type": options.contentType ?? "application/x-www-form-urlencoded"
  });
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  return new NextRequest(`${WC}/api/peptideos-wc-sso${options.search ?? ""}`, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half"
  });
}

function chunkedPostRequest(options: {
  chunks: Uint8Array[];
  contentLength?: string;
  onPull?: () => void;
  onCancel?: () => void;
}) {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      options.onPull?.();
      if (index >= options.chunks.length) {
        controller.close();
        return;
      }
      const next = options.chunks[index];
      index += 1;
      controller.enqueue(next);
    },
    cancel() {
      options.onCancel?.();
    }
  });
  const headers = new Headers({
    origin: POS,
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded"
  });
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  return new NextRequest(`${WC}/api/peptideos-wc-sso`, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half"
  });
}

test("POST rejects a content-length over 4KB, a missing body, and an oversized body without consuming", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const declared = fakeWorld();
    const declaredResponse = await runPeptideOsSsoPost(
      chunkedPostRequest({
        contentLength: String(SSO_POST_MAX_BYTES + 1),
        chunks: [new TextEncoder().encode(`token=${encodeURIComponent(rawToken)}`)]
      }),
      declared.deps,
      POS
    );
    const declaredJson = await declaredResponse.json();
    assert.deepEqual(declaredJson, { error: "payload_too_large" });
    assert.doesNotMatch(JSON.stringify(declaredJson), new RegExp(rawToken));
    assertRejectedWithoutConsume(declaredResponse, 413, declared.handoff, declared.claimCount);

    const missing = fakeWorld();
    const missingRequest = new NextRequest(`${WC}/api/peptideos-wc-sso`, {
      method: "POST",
      headers: {
        origin: POS,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      }
    });
    const missingResponse = await runPeptideOsSsoPost(missingRequest, missing.deps, POS);
    assert.deepEqual(await missingResponse.json(), { error: "empty_body" });
    assertRejectedWithoutConsume(missingResponse, 400, missing.handoff, missing.claimCount);

    const empty = fakeWorld();
    const emptyResponse = await runPeptideOsSsoPost(postRequest({ rawBody: "" }), empty.deps, POS);
    assert.deepEqual(await emptyResponse.json(), { error: "empty_body" });
    assertRejectedWithoutConsume(emptyResponse, 400, empty.handoff, empty.claimCount);

    const oversized = fakeWorld();
    const tokenPart = `token=${encodeURIComponent(rawToken)}&pad=`;
    const oversizedBody = tokenPart + "a".repeat(SSO_POST_MAX_BYTES);
    assert.ok(Buffer.byteLength(oversizedBody) > SSO_POST_MAX_BYTES);
    const oversizedResponse = await runPeptideOsSsoPost(
      postRequest({ rawBody: oversizedBody, contentLength: "32" }),
      oversized.deps,
      POS
    );
    const oversizedJson = await oversizedResponse.json();
    assert.deepEqual(oversizedJson, { error: "payload_too_large" });
    assert.doesNotMatch(JSON.stringify(oversizedJson), new RegExp(rawToken));
    assertRejectedWithoutConsume(oversizedResponse, 413, oversized.handoff, oversized.claimCount);

    const htmlWorld = fakeWorld();
    const html = await runPeptideOsSsoPost(
      postRequest({ rawBody: oversizedBody, contentLength: "32", accept: "text/html" }),
      htmlWorld.deps,
      POS
    );
    const page = await html.text();
    assert.equal(html.status, 413);
    assert.match(html.headers.get("content-type") ?? "", /text\/html/);
    assert.doesNotMatch(page, new RegExp(rawToken));
    assert.doesNotMatch(page, /payload_too_large/);
    assert.equal(htmlWorld.claimCount(), 0);

    const capped = fakeWorld();
    const pad = "b".repeat(SSO_POST_MAX_BYTES - Buffer.byteLength(tokenPart));
    const cappedBody = tokenPart + pad;
    assert.equal(Buffer.byteLength(cappedBody), SSO_POST_MAX_BYTES);
    const cappedResponse = await runPeptideOsSsoPost(postRequest({ rawBody: cappedBody }), capped.deps, POS);
    assert.equal(cappedResponse.status, 303);
    assert.ok(capped.handoff.consumed_at);
    assertSsoResponseHeaders(cappedResponse);
  } finally {
    console.error = original;
  }
});

test("POST treats Content-Length 0, abc, and an empty value as empty_body without reading", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    for (const contentLength of ["0", "abc", ""]) {
      const world = fakeWorld();
      const response = await runPeptideOsSsoPost(
        chunkedPostRequest({
          contentLength,
          chunks: [new TextEncoder().encode(`token=${encodeURIComponent(rawToken)}`)]
        }),
        world.deps,
        POS
      );
      const body = await response.json();
      assert.deepEqual(body, { error: "empty_body" });
      assert.doesNotMatch(JSON.stringify(body), new RegExp(rawToken));
      assertRejectedWithoutConsume(response, 400, world.handoff, world.claimCount);
    }
  } finally {
    console.error = original;
  }
});

test("POST aborts a chunked body once it passes 4KB and does not consume", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    let pulls = 0;
    let cancelled = false;
    const chunkCount = 8;
    const chunks = Array.from({ length: chunkCount }, () => new Uint8Array(1024));
    const tokenBytes = new TextEncoder().encode(`token=${encodeURIComponent(rawToken)}&pad=`);
    chunks[0].set(tokenBytes);
    const world = fakeWorld();
    const response = await runPeptideOsSsoPost(
      chunkedPostRequest({
        chunks,
        onPull: () => {
          pulls += 1;
        },
        onCancel: () => {
          cancelled = true;
        }
      }),
      world.deps,
      POS
    );
    const body = await response.json();
    assert.deepEqual(body, { error: "payload_too_large" });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(rawToken));
    assert.equal(cancelled, true);
    assert.ok(pulls > SSO_POST_MAX_BYTES / 1024);
    assert.ok(pulls < chunkCount);
    assertRejectedWithoutConsume(response, 413, world.handoff, world.claimCount);
  } finally {
    console.error = original;
  }
});

test("POST email collision is 409 and the handoff stays consumed", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const { deps, handoff } = fakeWorld({
      signUp: async () => {
        throw new Error("User already exists");
      }
    });
    deps.findUserByEmail = async () => null;
    const response = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "sso_email_collision" });
    assertSsoResponseHeaders(response);
    assert.ok(handoff.consumed_at);

    const replay = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
    assert.equal(replay.status, 400);
    assert.deepEqual(await replay.json(), { error: "invalid_or_expired_handoff" });
  } finally {
    console.error = original;
  }
});

function guardedRejection(
  invoke: (...args: unknown[]) => Response,
  request: NextRequest,
  deps: PeptideOsSsoDeps
) {
  let urlReads = 0;
  let depCalls = 0;
  const guardedRequest = new Proxy(request, {
    get(target, prop, receiver) {
      if (prop === "nextUrl" || prop === "url") urlReads += 1;
      return Reflect.get(target, prop, receiver);
    }
  });
  const guardedDeps = new Proxy(deps, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          depCalls += 1;
          return (value as (...fnArgs: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    }
  });
  const lines: string[] = [];
  const write = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  const original = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
    debug: console.debug
  };
  console.error = write;
  console.info = write;
  console.log = write;
  console.warn = write;
  console.debug = write;
  try {
    const response = invoke(guardedRequest, guardedDeps);
    return { response, urlReads, depCalls, logs: lines.join("\n") };
  } finally {
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
    console.debug = original.debug;
  }
}

test("GET ?token= returns 405 and does not read, log, or consume the token", async () => {
  const legacyToken = "legacy-get-handoff-token";
  const world = fakeWorld();
  const url = new URL(`${WC}/api/peptideos-wc-sso`);
  url.searchParams.set("token", legacyToken);
  url.searchParams.set("return", DASHBOARD);
  const { response, urlReads, depCalls, logs } = guardedRejection(ssoMethodNotAllowed, new NextRequest(url), world.deps);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(await response.json(), { error: "method_not_allowed" });
  assertSsoResponseHeaders(response);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(urlReads, 0);
  assert.equal(depCalls, 0);
  assert.equal(world.claimCount(), 0);
  assert.equal(world.handoff.consumed_at, null);
  assert.doesNotMatch(logs, /legacy-get-handoff-token/);
});

test("GET without a token is the same 405 and does not consume", async () => {
  const world = fakeWorld();
  const request = new NextRequest(`${WC}/api/peptideos-wc-sso`);
  const { response, urlReads, depCalls } = guardedRejection(ssoMethodNotAllowed, request, world.deps);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(await response.json(), { error: "method_not_allowed" });
  assertSsoResponseHeaders(response);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(urlReads, 0);
  assert.equal(depCalls, 0);
  assert.equal(world.claimCount(), 0);
  assert.equal(world.handoff.consumed_at, null);
});

test("HEAD and other methods are 405 with Allow POST and do not consume", async () => {
  const legacyToken = "legacy-get-handoff-token";
  const world = fakeWorld();
  const url = new URL(`${WC}/api/peptideos-wc-sso`);
  url.searchParams.set("token", legacyToken);

  const head = guardedRejection(
    ssoHeadNotAllowed,
    new NextRequest(url, { method: "HEAD" }),
    world.deps
  );
  assert.equal(head.response.status, 405);
  assert.equal(head.response.headers.get("allow"), "POST");
  assert.equal(await head.response.text(), "");
  assertSsoResponseHeaders(head.response);
  assert.equal(head.response.headers.get("set-cookie"), null);
  assert.equal(head.urlReads, 0);
  assert.equal(head.depCalls, 0);
  assert.doesNotMatch(head.logs, /legacy-get-handoff-token/);

  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
    const rejected = guardedRejection(
      ssoMethodNotAllowed,
      new NextRequest(url, { method }),
      world.deps
    );
    assert.equal(rejected.response.status, 405, method);
    assert.equal(rejected.response.headers.get("allow"), "POST", method);
    assert.deepEqual(await rejected.response.json(), { error: "method_not_allowed" }, method);
    assertSsoResponseHeaders(rejected.response);
    assert.equal(rejected.response.headers.get("set-cookie"), null, method);
    assert.equal(rejected.urlReads, 0, method);
    assert.equal(rejected.depCalls, 0, method);
    assert.doesNotMatch(rejected.logs, /legacy-get-handoff-token/);
  }

  assert.equal(world.claimCount(), 0);
  assert.equal(world.handoff.consumed_at, null);
});

test("handoff consume still requires a single unused row inside the 120-second expiry", () => {
  const src = readFileSync("app/api/peptideos-wc-sso/consume-handoff.ts", "utf8");
  assert.match(src, /consumed_at IS NULL/);
  assert.match(src, /expires_at > NOW\(\)/);
  assert.match(src, /120-second/);
});

test("GET is 405 and POST is Origin-checked outside Better Auth", () => {
  const route = readFileSync("app/api/peptideos-wc-sso/route.ts", "utf8");
  const runner = readFileSync("app/api/peptideos-wc-sso/run-sso.ts", "utf8");
  const proxy = readFileSync("proxy.ts", "utf8");
  const auth = readFileSync("src/features/auth/lib/better-auth.ts", "utf8");

  for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.match(route, new RegExp(`export function ${method}\\(\\) \\{\\s*return ssoMethodNotAllowed\\(\\);\\s*\\}`));
  }
  assert.match(route, /export function HEAD\(\) \{\s*return ssoHeadNotAllowed\(\);\s*\}/);
  assert.doesNotMatch(route, /export function GET\(\) \{[^}]*ssoDeps/);
  assert.doesNotMatch(route, /export function GET\(\) \{[^}]*searchParams/);
  assert.doesNotMatch(route, /runPeptideOsSso[^P\w]/);
  assert.doesNotMatch(runner, /searchParams\.get\(\s*["']token["']\)/);
  assert.doesNotMatch(runner, /searchParams\.get\(\s*["']return["']\)/);
  assert.match(runner, /params\.get\("return"\)/);
  assert.match(runner, /status:\s*303/);
  assert.doesNotMatch(runner, /function runPeptideOsSso\b/);
  assert.match(route, /export async function POST/);
  assert.match(route, /runPeptideOsSsoPost/);
  assert.match(route, /peptideOsOrigin\(env\.NEXT_PUBLIC_PEPTIDEOS_URL, env\.NEXT_PUBLIC_APP_URL\)/);
  assert.match(proxy, /\(\?!api\|/);
  assert.match(auth, /trustedOrigins: betterAuthTrustedOrigins\(env\.BETTER_AUTH_URL, env\.NEXT_PUBLIC_APP_URL\)/);
  assert.doesNotMatch(auth, /disableCSRFCheck/);
  assert.doesNotMatch(route, /from ["'][^"']*peptideos-wc-signout|from ["'][^"']*signed-out-gate/);
  assert.doesNotMatch(route, /disableCSRFCheck:\s*true/);
});

test("Better Auth's HTTP origin check rejects PeptideOS, and auth.api sign-up does not", async () => {
  const testAuth = betterAuth({
    baseURL: WC,
    secret: "test_secret_key_32_chars_minimum_xx",
    trustedOrigins: [WC],
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    logger: { disabled: true }
  });
  const headers = { origin: POS, cookie: "detected-locale=en", referer: `${POS}/` };
  const http = await testAuth.handler(
    new Request(`${WC}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ email: "http@example.test", password: "password1234", name: "Athlete" })
    })
  );
  assert.equal(http.status, 403);
  assert.deepEqual(await http.json(), { code: "INVALID_ORIGIN", message: "Invalid origin" });

  const api = await testAuth.api.signUpEmail({
    body: { email: "api@example.test", password: "password1234", name: "Athlete" },
    headers: new Headers(headers),
    asResponse: true
  });
  assert.equal(api.status, 200);
});
