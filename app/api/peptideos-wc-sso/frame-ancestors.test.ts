import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsSsoPost } from "./run-sso";

import type { PeptideOsSsoDeps } from "./run-sso";

import { FRAME_ANCESTORS_CSP } from "@/shared/lib/frame-ancestors";

const POS = "https://peptideos.us";
const WC = "https://workouts.example.test";

/**
 * frame-ancestors governs embedding only. These assertions still expect the
 * top-level PeptideOS form POST to return 303 (or the same error status).
 * The browser does not consult frame-ancestors for that navigation.
 */
function assertFrameAncestors(response: Response) {
  assert.equal(response.headers.get("content-security-policy"), FRAME_ANCESTORS_CSP);
  assert.equal(response.headers.get("x-frame-options"), null);
}

function post(options: { origin?: string | null; accept?: string; contentType?: string | null; body?: string }) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? POS);
  headers.set("accept", options.accept ?? "application/json");
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/x-www-form-urlencoded");
  }
  return new NextRequest(`${WC}/api/peptideos-wc-sso`, {
    method: "POST",
    headers,
    body: options.body ?? "token=plaintext-handoff"
  });
}

function successDeps(): PeptideOsSsoDeps {
  return {
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
}

test("SSO POST 303 carries the exact frame-ancestors allowlist and still navigates", async () => {
  const response = await runPeptideOsSsoPost(post({}), successDeps(), POS);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${WC}/`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assertFrameAncestors(response);
});

test("SSO POST error responses carry the exact frame-ancestors allowlist", async () => {
  const forbidden = await runPeptideOsSsoPost(post({ origin: "https://evil.example" }), successDeps(), POS);
  assert.equal(forbidden.status, 403);
  assertFrameAncestors(forbidden);

  const html = await runPeptideOsSsoPost(
    post({ origin: "https://evil.example", accept: "text/html" }),
    successDeps(),
    POS
  );
  assert.equal(html.status, 403);
  assert.match(html.headers.get("content-type") ?? "", /text\/html/);
  assertFrameAncestors(html);

  const unsupported = await runPeptideOsSsoPost(post({ contentType: "application/json", body: "{}" }), successDeps(), POS);
  assert.equal(unsupported.status, 415);
  assertFrameAncestors(unsupported);

  const missing = await runPeptideOsSsoPost(post({ body: "redirect=/" }), successDeps(), POS);
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: "missing_token" });
  assertFrameAncestors(missing);
});
