import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import {
  SIGNOUT_CONTINUE_COOKIE,
  SIGNOUT_CONTINUE_HOST_COOKIE,
  SIGNOUT_CONTINUE_OK_HEADER,
  isSignoutContinueAutoSubmitHeader,
  issueSignoutContinueToken,
  signSignoutContinueDecision
} from "./signout-continue-token";
import { prepareSignoutContinueRequestHeaders, signoutContinueProxyResponse } from "./signout-continue-proxy";

const SECRET = "test-signout-continue-secret";
const POS = "https://peptideos.us";
const WC = "https://workouts.peptideos.us";

function cookieStore(entries: Record<string, string>) {
  return {
    get: (name: string) => (entries[name] ? { value: entries[name] } : undefined)
  };
}

test("prepareSignoutContinueRequestHeaders strips a client-forged continue header", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = SECRET;
  try {
    const headers = new Headers({ [SIGNOUT_CONTINUE_OK_HEADER]: "1", origin: WC });
    const prepared = prepareSignoutContinueRequestHeaders({ headers, cookies: cookieStore({}) }, () => false);

    assert.equal(prepared.autoSubmit, false);
    assert.notEqual(prepared.headers.get(SIGNOUT_CONTINUE_OK_HEADER), "1");
    assert.equal(isSignoutContinueAutoSubmitHeader(prepared.headers), false);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("prepareSignoutContinueRequestHeaders sets a signed 1 only after consume succeeds", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = SECRET;
  try {
    const raw = issueSignoutContinueToken(Date.now(), SECRET);
    assert.ok(raw);

    const prepared = prepareSignoutContinueRequestHeaders(
      { headers: new Headers({ [SIGNOUT_CONTINUE_OK_HEADER]: "1" }), cookies: cookieStore({ [SIGNOUT_CONTINUE_COOKIE]: raw }) },
      (value) => value === raw
    );

    assert.equal(prepared.autoSubmit, true);
    assert.equal(isSignoutContinueAutoSubmitHeader(prepared.headers), true);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("prepareSignoutContinueRequestHeaders reuses a signed decision without consuming again", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = SECRET;
  try {
    let consumed = 0;
    const signed = signSignoutContinueDecision(true, Date.now(), SECRET);
    assert.ok(signed);
    const prepared = prepareSignoutContinueRequestHeaders(
      { headers: new Headers({ [SIGNOUT_CONTINUE_OK_HEADER]: signed }), cookies: cookieStore({}) },
      () => {
      consumed += 1;
      return false;
    });

    assert.equal(consumed, 0);
    assert.equal(prepared.autoSubmit, true);
    assert.equal(isSignoutContinueAutoSubmitHeader(prepared.headers), true);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("signoutContinueProxyResponse forwards consume via NextResponse request headers and clears cookies", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = SECRET;
  try {
    const raw = issueSignoutContinueToken();
    assert.ok(raw);

    const request = new NextRequest("https://workouts.peptideos.us/auth/signout/continue", {
      headers: {
        cookie: `${SIGNOUT_CONTINUE_HOST_COOKIE}=${raw}`,
        [SIGNOUT_CONTINUE_OK_HEADER]: "1"
      }
    });

    const response = signoutContinueProxyResponse(request, { locale: "en", peptideOsOrigin: POS, appUrl: WC });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-middleware-rewrite") ?? response.headers.get("location") ?? "", /\/en\/auth\/signout\/continue/);
    assert.equal(response.headers.get("x-next-locale"), "en");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /form-action/);

    const cookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [
      response.headers.get("set-cookie") ?? ""
    ];
    const joined = cookies.join("\n");
    assert.match(joined, /wc_signout_continue=.*Max-Age=0/i);
    assert.match(joined, /__Host-wc_signout_continue=.*Max-Age=0/i);
    assert.match(joined, /__Host-wc_signout_continue=.*Secure/i);
  } finally {
    if (previous === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previous;
    }
  }
});
