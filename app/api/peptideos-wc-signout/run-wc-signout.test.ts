import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";

import { hopCOriginAllowlist, isTrustedPeptideOsHopCRequest, runPeptideOsWcSignout, TRUSTED_HOP_C_ORIGINS } from "./run-wc-signout";

const WC = "https://workouts.peptideos.us";
const POS = "https://peptideos.us";
const POS_WWW = "https://www.peptideos.us";

function hopCPost(redirect?: string, headers: Record<string, string> = { origin: POS }) {
  const url = new URL(`${WC}/api/peptideos-wc-signout`);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  return new NextRequest(url, {
    method: "POST",
    headers: { cookie: "better-auth.session_token=test", ...headers }
  });
}

test("trusted hop C Origins are exactly peptideos.us and www.peptideos.us", () => {
  assert.deepEqual([...TRUSTED_HOP_C_ORIGINS], ["https://peptideos.us", "https://www.peptideos.us"]);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: POS })), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: POS_WWW })), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: `${POS}/` })), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ referer: `${POS}/auth/signout` })), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ referer: `${POS_WWW}/` })), true);
});

test("hop C allowlist adds only the env-configured app origin so local dev is not blocked", () => {
  const localApp = "http://localhost:3000";
  const productionApp = WC;

  assert.deepEqual(hopCOriginAllowlist(productionApp), [POS, POS_WWW, productionApp]);
  assert.deepEqual(hopCOriginAllowlist(POS), [POS, POS_WWW]);
  assert.deepEqual(hopCOriginAllowlist(localApp), [POS, POS_WWW, localApp]);

  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: localApp }), localApp), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ referer: `${localApp}/signout` }), localApp), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: POS }), localApp), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: POS_WWW }), productionApp), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: localApp })), false);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: "http://localhost:3001" }), localApp), false);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: "https://staging.peptideos.us" }), productionApp), false);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: "https://*.peptideos.us" }), localApp), false);
});

test("trusted hop C Origin rejects anything that is not an exact allowlisted origin", () => {
  const rejected: Array<Record<string, string>> = [
    { origin: WC },
    { origin: "https://evil.example" },
    { origin: "https://staging.peptideos.us" },
    { origin: "https://peptideos.us.evil.example" },
    { origin: "http://peptideos.us" },
    { origin: "https://app.peptideos.us" },
    { origin: "https://*.peptideos.us" },
    { referer: `${WC}/` },
    { origin: "https://evil.example", referer: `${POS}/` },
    {}
  ];
  for (const headers of rejected) {
    assert.equal(isTrustedPeptideOsHopCRequest(new Headers(headers)), false, JSON.stringify(headers));
  }
});

test("hop C POST from PeptideOS Origin ends the WC session and 303s to PeptideOS /", async () => {
  const calls: Headers[] = [];
  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`), {
    signOut: async ({ headers }) => {
      calls.push(headers);
    },
    peptideOsOrigin: POS
  });

  assert.equal(calls.length, 1);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${POS}/`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(response.headers.get("location") ?? "", /workouts\/signout|auth\/signout/);
});

test("hop C POST with www Origin or apex Referer is allowed", async () => {
  const fromWww = await runPeptideOsWcSignout(hopCPost(`${POS}/`, { origin: POS_WWW }), {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(fromWww.status, 303);

  const fromReferer = await runPeptideOsWcSignout(hopCPost(`${POS}/`, { referer: `${POS}/auth/signout` }), {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(fromReferer.status, 303);
  assert.equal(fromReferer.headers.get("location"), `${POS}/`);
});

test("hop C rejects missing or foreign Origin/Referer with 403 and does not sign out", async () => {
  const rejected: Array<Record<string, string>> = [
    {},
    { origin: WC },
    { origin: "https://evil.example" },
    { origin: "https://staging.peptideos.us" },
    { referer: `${WC}/profile` },
    { origin: "https://evil.example", referer: `${POS}/` }
  ];

  for (const headers of rejected) {
    let signedOut = false;
    const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`, headers), {
      signOut: async () => {
        signedOut = true;
      },
      peptideOsOrigin: POS
    });
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.equal(signedOut, false, JSON.stringify(headers));
  }
});

test("hop C POST from the configured local app origin is allowed and still 303s to PeptideOS", async () => {
  const localApp = "http://localhost:3010";
  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`, { origin: localApp }), {
    signOut: async () => undefined,
    peptideOsOrigin: POS,
    configuredAppOrigin: localApp
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${POS}/`);
});

test("hop C logs through logSsoEvent when signOut returns a non-ok Response", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`), {
      signOut: async () => new Response("token=secret-session", { status: 400, statusText: "password=hunter2" }),
      peptideOsOrigin: POS
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${POS}/`);
  } finally {
    console.error = original;
  }

  const logged = lines.join("\n");
  assert.match(logged, /\[peptideos-wc-sso\]/);
  assert.match(logged, /wc_signout/);
  assert.match(logged, /signout_not_ok/);
  assert.match(logged, /400/);
  assert.doesNotMatch(logged, /secret-session|hunter2|password=/);
});

test("hop C still lands on PeptideOS / when sign-out throws and logs through the SSO logger", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`), {
      signOut: async () => {
        throw Object.assign(new Error("token=secret-session password=hunter2"), { name: "APIError", code: "BAD_REQUEST" });
      },
      peptideOsOrigin: POS
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${POS}/`);
  } finally {
    console.error = original;
  }

  const logged = lines.join("\n");
  assert.match(logged, /\[peptideos-wc-sso\]/);
  assert.match(logged, /wc_signout/);
  assert.match(logged, /BAD_REQUEST/);
  assert.doesNotMatch(logged, /secret-session|hunter2|password=/);
});

test("hop C fails closed to PeptideOS / and never calls hop B or WC /auth/signout", async () => {
  const denied = [
    undefined,
    `${WC}/`,
    `${WC}/auth/signout`,
    `${WC}/AUTH/SIGNOUT`,
    `${WC}/auth/signout/continue`,
    `${POS}/auth/signout`,
    `${POS}/api/workouts/signout`,
    `${POS}/API/workouts/signout`,
    `${POS}/api/workouts/signout?redirect=${encodeURIComponent(`${WC}/`)}`,
    "https://evil.example/",
    "//evil.example/"
  ];

  for (const redirect of denied) {
    const response = await runPeptideOsWcSignout(hopCPost(redirect), {
      signOut: async () => undefined,
      peptideOsOrigin: POS
    });
    assert.equal(response.status, 303, String(redirect));
    assert.equal(response.headers.get("location"), `${POS}/`, String(redirect));
    assert.doesNotMatch(response.headers.get("location") ?? "", /\/api\/workouts\/signout/, String(redirect));
    assert.doesNotMatch(response.headers.get("location") ?? "", /workouts\.peptideos\.us\/auth\/signout/, String(redirect));
  }
});

test("hop C honours a safe PeptideOS same-origin landing other than leftover auth", async () => {
  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/settings`), {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(response.headers.get("location"), `${POS}/settings`);
});

test("hop C reads redirect from the POST form body", async () => {
  const url = new URL(`${WC}/api/peptideos-wc-signout`);
  const request = new NextRequest(url, {
    method: "POST",
    headers: {
      origin: POS,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: `redirect=${encodeURIComponent(`${POS}/settings`)}`
  });

  const response = await runPeptideOsWcSignout(request, {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${POS}/settings`);
});

test("hop C 303 from real Better Auth signOut clears session_token and session_data", async () => {
  const testAuth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test_secret_key_32_chars_minimum_xx",
    trustedOrigins: ["http://localhost:3000"],
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true } }
  });

  const signedIn = await testAuth.api.signUpEmail({
    body: { email: "athlete@example.test", password: "password1234", name: "Athlete" },
    asResponse: true
  });
  assert.equal(signedIn.status, 200);
  const sessionCookie = signedIn.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  assert.match(sessionCookie, /better-auth\.session_token=/);
  assert.match(sessionCookie, /better-auth\.session_data=/);

  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`, { origin: POS, cookie: sessionCookie }), {
    signOut: (args) => testAuth.api.signOut({ headers: args.headers, asResponse: true }),
    peptideOsOrigin: POS
  });

  assert.equal(response.status, 303);
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""];
  const joined = cookies.join("\n");
  assert.match(joined, /(?:^|[\n,])(?:__Secure-)?better-auth\.session_token=.*Max-Age=0/i);
  assert.match(joined, /(?:^|[\n,])(?:__Secure-)?better-auth\.session_data=.*Max-Age=0/i);
});
