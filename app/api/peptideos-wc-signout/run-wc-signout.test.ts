import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { isTrustedPeptideOsHopCRequest, runPeptideOsWcSignout } from "./run-wc-signout";

const WC = "https://workouts.peptideos.us";
const POS = "https://peptideos.us";

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

test("trusted hop C Origin is PeptideOS only; Referer is fallback", () => {
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: POS }), POS), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: `${POS}/` }), POS), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ referer: `${POS}/auth/signout` }), POS), true);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: WC }), POS), false);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ origin: "https://evil.example" }), POS), false);
  assert.equal(
    isTrustedPeptideOsHopCRequest(new Headers({ origin: "https://evil.example", referer: `${POS}/` }), POS),
    false
  );
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers({ referer: `${WC}/` }), POS), false);
  assert.equal(isTrustedPeptideOsHopCRequest(new Headers(), POS), false);
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

test("hop C POST with Referer and no Origin is allowed", async () => {
  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`, { referer: `${POS}/auth/signout` }), {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${POS}/`);
});

test("hop C rejects missing or foreign Origin/Referer with 403 and does not sign out", async () => {
  const rejected: Array<Record<string, string>> = [
    {},
    { origin: WC },
    { origin: "https://evil.example" },
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

test("hop C still lands on PeptideOS / when sign-out throws", async () => {
  const response = await runPeptideOsWcSignout(hopCPost(`${POS}/`), {
    signOut: async () => {
      throw new Error("FAILED_TO_GET_SESSION");
    },
    peptideOsOrigin: POS
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${POS}/`);
});

test("hop C fails closed to PeptideOS / and never calls hop B or WC /auth/signout", async () => {
  const denied = [
    undefined,
    `${WC}/`,
    `${WC}/auth/signout`,
    `${WC}/auth/signout/continue`,
    `${POS}/auth/signout`,
    `${POS}/api/workouts/signout`,
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
