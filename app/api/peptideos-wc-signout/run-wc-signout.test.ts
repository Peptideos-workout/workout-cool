import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { runPeptideOsWcSignout } from "./run-wc-signout";

const WC = "https://workouts.peptideos.us";
const POS = "https://peptideos.us";

function hopCRequest(redirect?: string) {
  const url = new URL(`${WC}/api/peptideos-wc-signout`);
  if (redirect) {
    url.searchParams.set("redirect", redirect);
  }
  return new NextRequest(url, { headers: { cookie: "better-auth.session_token=test" } });
}

test("hop C ends the WC session and 303s to PeptideOS /", async () => {
  const calls: Headers[] = [];
  const response = await runPeptideOsWcSignout(hopCRequest(`${POS}/`), {
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

test("hop C still lands on PeptideOS / when sign-out throws", async () => {
  const response = await runPeptideOsWcSignout(hopCRequest(`${POS}/`), {
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
    const response = await runPeptideOsWcSignout(hopCRequest(redirect), {
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
  const response = await runPeptideOsWcSignout(hopCRequest(`${POS}/settings`), {
    signOut: async () => undefined,
    peptideOsOrigin: POS
  });
  assert.equal(response.headers.get("location"), `${POS}/settings`);
});
