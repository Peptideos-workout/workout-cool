import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsWcSignout } from "./run-wc-signout";

import { FRAME_ANCESTORS_CSP } from "@/shared/lib/frame-ancestors";

function assertFrameAncestors(response: Response) {
  assert.equal(response.headers.get("content-security-policy"), FRAME_ANCESTORS_CSP);
  assert.equal(response.headers.get("x-frame-options"), null);
}

test("sign-out POST 303 and its 403 carry the exact frame-ancestors allowlist", async () => {
  const denied = await runPeptideOsWcSignout(
    new NextRequest("https://workouts.example.test/api/peptideos-wc-signout", {
      method: "POST",
      headers: { origin: "https://evil.example" }
    }),
    { signOut: async () => new Response(null, { status: 200 }), peptideOsOrigin: "https://peptideos.us" }
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("cache-control"), "private, no-store");
  assertFrameAncestors(denied);

  const response = await runPeptideOsWcSignout(
    new NextRequest("https://workouts.example.test/api/peptideos-wc-signout", {
      method: "POST",
      headers: { origin: "https://peptideos.us" }
    }),
    { signOut: async () => new Response(null, { status: 200 }), peptideOsOrigin: "https://peptideos.us" }
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://peptideos.us/");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assertFrameAncestors(response);
});
