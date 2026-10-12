import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";

import { SSO_POST_MAX_BYTES, isExactPeptideOsSsoOrigin, runPeptideOsSso, runPeptideOsSsoPost } from "./run-sso";
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
  origin?: string | null;
  contentType?: string | null;
  accept?: string;
  cookie?: string;
  referer?: string;
  queryToken?: string;
  rawBody?: string;
  contentLength?: string;
}) {
  const url = new URL(`${WC}/api/peptideos-wc-sso`);
  if (options.queryToken) url.searchParams.set("token", options.queryToken);
  const params = new URLSearchParams();
  if (options.token !== undefined) params.set("token", options.token);
  if (options.redirect !== undefined) params.set("redirect", options.redirect);
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
  } finally {
    console.error = original;
  }
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

test("an expired handoff fails and is not consumed", async () => {
  const { deps, handoff, claimCount } = fakeWorld({ expiresAt: new Date(claimedAt.getTime() - 1_000) });
  const response = await runPeptideOsSsoPost(postRequest({ token: rawToken }), deps, POS);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_or_expired_handoff" });
  assertSsoResponseHeaders(response);
  assert.equal(handoff.consumed_at, null);
  assert.equal(claimCount(), 1);
});

test("POST ignores a query-string token and a non-form body", async () => {
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

  const json = fakeWorld();
  const fromJson = await runPeptideOsSsoPost(
    postRequest({ token: rawToken, contentType: "application/json" }),
    json.deps,
    POS
  );
  assert.equal(fromJson.status, 400);
  assert.deepEqual(await fromJson.json(), { error: "missing_token" });
  assert.equal(json.handoff.consumed_at, null);
  assert.equal(json.claimCount(), 0);
});

function assertPayloadTooLarge(response: Response, handoff: FakeHandoff, claimCount: () => number) {
  assert.equal(response.status, 413);
  assertSsoResponseHeaders(response);
  assert.equal(handoff.consumed_at, null);
  assert.equal(claimCount(), 0);
}

test("POST rejects a content-length over 4KB, a missing body, and an oversized body without consuming", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const declared = fakeWorld();
    const declaredResponse = await runPeptideOsSsoPost(
      postRequest({ token: rawToken, contentLength: String(SSO_POST_MAX_BYTES + 1) }),
      declared.deps,
      POS
    );
    assert.deepEqual(await declaredResponse.json(), { error: "payload_too_large" });
    assertPayloadTooLarge(declaredResponse, declared.handoff, declared.claimCount);

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
    assert.deepEqual(await missingResponse.json(), { error: "payload_too_large" });
    assertPayloadTooLarge(missingResponse, missing.handoff, missing.claimCount);

    const empty = fakeWorld();
    const emptyResponse = await runPeptideOsSsoPost(postRequest({ rawBody: "" }), empty.deps, POS);
    assert.deepEqual(await emptyResponse.json(), { error: "payload_too_large" });
    assertPayloadTooLarge(emptyResponse, empty.handoff, empty.claimCount);

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
    assertPayloadTooLarge(oversizedResponse, oversized.handoff, oversized.claimCount);

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

test("GET ?token= still signs in and is not stored or referred", async () => {
  const { deps, handoff } = fakeWorld();
  const url = new URL(`${WC}/api/peptideos-wc-sso`);
  url.searchParams.set("token", rawToken);
  const response = await runPeptideOsSso(new NextRequest(url), deps);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${WC}/`);
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
  assertSsoResponseHeaders(response);
  assert.ok(handoff.consumed_at);
});

test("handoff consume still requires a single unused row inside the 120-second expiry", () => {
  const src = readFileSync("app/api/peptideos-wc-sso/consume-handoff.ts", "utf8");
  assert.match(src, /consumed_at IS NULL/);
  assert.match(src, /expires_at > NOW\(\)/);
  assert.match(src, /120-second/);
});

test("GET stays for the rollout window and POST is Origin-checked outside Better Auth", () => {
  const route = readFileSync("app/api/peptideos-wc-sso/route.ts", "utf8");
  const proxy = readFileSync("proxy.ts", "utf8");
  const auth = readFileSync("src/features/auth/lib/better-auth.ts", "utf8");

  assert.match(route, /TODO: remove GET \?token=/);
  assert.match(route, /export async function GET/);
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
