import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsSsoPost, ssoMethodNotAllowed } from "./run-sso";

import type { PeptideOsSsoDeps } from "./run-sso";

const WC = "https://workouts.example.test";
const POS = "https://peptideos.us";
const TOKEN = "legacy-get-handoff-token";

function withPeptideEnv(explicit: string | undefined, app: string | undefined, run: () => Promise<void>) {
  const previousExplicit = process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit === undefined) delete process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
  else process.env.NEXT_PUBLIC_PEPTIDEOS_URL = explicit;
  if (app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = app;
  return run().finally(() => {
    if (previousExplicit === undefined) delete process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
    else process.env.NEXT_PUBLIC_PEPTIDEOS_URL = previousExplicit;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
  });
}

function getRequest(accept?: string, fetchMode?: string) {
  const headers = new Headers();
  if (accept) headers.set("accept", accept);
  if (fetchMode) headers.set("sec-fetch-mode", fetchMode);
  let urlReads = 0;
  const request = new NextRequest(`${WC}/api/peptideos-wc-sso?token=${TOKEN}&return=/secret`, { method: "GET", headers });
  const guarded = new Proxy(request, {
    get(target, prop) {
      if (prop === "url" || prop === "nextUrl") urlReads += 1;
      // Bind to the request. Node 24's headers getter rejects a proxy receiver.
      return Reflect.get(target, prop, target);
    }
  }) as NextRequest;
  return { request: guarded, urlReads: () => urlReads };
}

async function assertHtml405(response: Response, href: string) {
  const html = await response.text();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(html, /Try again/i);
  assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.doesNotMatch(html, /method_not_allowed/);
  assert.doesNotMatch(html, new RegExp(TOKEN));
  assert.doesNotMatch(html, /return=/);
  assert.doesNotMatch(html, /sso\.invalid/);
}

test("GET with Accept text/html returns the SSO error page at 405", async () => {
  await withPeptideEnv(undefined, undefined, async () => {
    const guarded = getRequest("text/html,application/xhtml+xml", "cors");
    const response = ssoMethodNotAllowed(guarded.request);
    await assertHtml405(response, "https://peptideos.us/api/workouts/sso");
    assert.equal(guarded.urlReads(), 0);
  });

  await withPeptideEnv("https://www.peptideos.us", "https://workouts.peptideos.us", async () => {
    const guarded = getRequest("text/html", "same-origin");
    const response = ssoMethodNotAllowed(guarded.request);
    await assertHtml405(response, "https://www.peptideos.us/api/workouts/sso");
    assert.equal(guarded.urlReads(), 0);
  });
});

test("GET with Sec-Fetch-Mode navigate returns the SSO error page at 405", async () => {
  await withPeptideEnv(undefined, undefined, async () => {
    for (const accept of ["application/json", "*/*", undefined]) {
      const guarded = getRequest(accept, "navigate");
      const response = ssoMethodNotAllowed(guarded.request);
      await assertHtml405(response, "https://peptideos.us/api/workouts/sso");
      assert.equal(guarded.urlReads(), 0, accept ?? "absent");
    }
  });
});

test("GET without Accept text/html or Sec-Fetch-Mode navigate stays a JSON 405", async () => {
  const cases: Array<{ accept?: string; mode?: string }> = [
    {},
    { accept: "application/json" },
    { accept: "*/*" },
    { accept: "application/json", mode: "cors" },
    { accept: "*/*", mode: "same-origin" },
    { accept: "application/json", mode: "no-cors" }
  ];
  for (const { accept, mode } of cases) {
    const label = `${accept ?? "absent"}/${mode ?? "absent"}`;
    const guarded = getRequest(accept, mode);
    const response = ssoMethodNotAllowed(guarded.request);
    const body = await response.text();
    assert.equal(response.status, 405, label);
    assert.equal(response.headers.get("allow"), "POST", label);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/, label);
    assert.deepEqual(JSON.parse(body), { error: "method_not_allowed" });
    assert.equal(response.headers.get("set-cookie"), null, label);
    assert.doesNotMatch(body, new RegExp(TOKEN));
    assert.equal(guarded.urlReads(), 0, label);
  }
});

test("browser GET is wired to the request and still does not read the query string", () => {
  const route = readFileSync("app/api/peptideos-wc-sso/route.ts", "utf8");
  assert.match(route, /export function GET\(request: NextRequest\) \{\s*return ssoMethodNotAllowed\(request\);\s*\}/);
  assert.doesNotMatch(route, /export function GET\([^)]*\) \{[^}]*searchParams/);
  assert.doesNotMatch(route, /export function GET\([^)]*\) \{[^}]*ssoDeps/);
  assert.match(route, /export async function POST/);
  assert.match(route, /runPeptideOsSsoPost/);
});

test("successful form POST still redirects with 303", async () => {
  const deps: PeptideOsSsoDeps = {
    claimByHash: async () => [{ user_id: "peptideos-user", consumed_at: new Date("2026-10-13T00:00:00.000Z") }],
    lookupAuthUser: async () => ({ email: "athlete@example.test", meta: { full_name: "Ada Athlete" } }),
    loadSsoAccountSnapshot: async () => ({ existingUser: { id: "wc-user" }, peptideosAccountId: "peptideos-user" }),
    findUserByEmail: async () => ({ id: "wc-user" }),
    signUp: async () => null,
    createPeptideosAccount: async () => undefined,
    findPeptideosAccountByUserId: async () => ({ accountId: "peptideos-user" }),
    createSignedSession: async () => ({
      ok: true,
      wroteSession: true,
      response: new Response(null, { status: 200, headers: { "set-cookie": "better-auth.session_token=sess; Path=/" } })
    }),
    workoutOrigin: WC
  };
  const request = new NextRequest(`${WC}/api/peptideos-wc-sso`, {
    method: "POST",
    headers: {
      accept: "text/html",
      origin: POS,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "token=plaintext-handoff"
  });
  const response = await runPeptideOsSsoPost(request, deps, POS);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${WC}/`);
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/);
});
