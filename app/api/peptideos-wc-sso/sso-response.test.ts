import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { safeSsoErrorBody, ssoClientError, ssoJson } from "./sso-response";

test("SSO error responses are not storeable", () => {
  const response = ssoJson({ error: "sso_email_collision" }, 409);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.status, 409);
});

test("SSO errors stay JSON for API callers and HTML for browser navigations", async () => {
  const jsonReq = new NextRequest("https://workouts.example.test/api/peptideos-wc-sso?token=x", {
    headers: { Accept: "application/json" }
  });
  const jsonRes = ssoClientError(jsonReq, { error: "missing_token" }, 400, "https://peptideos.us/api/workouts/sso");
  assert.equal(jsonRes.headers.get("content-type")?.includes("application/json"), true);
  assert.deepEqual(await jsonRes.json(), { error: "missing_token" });

  const htmlReq = new NextRequest("https://workouts.example.test/api/peptideos-wc-sso?token=x", {
    headers: { Accept: "text/html" }
  });
  const htmlRes = ssoClientError(htmlReq, { error: "missing_token" }, 400, "https://peptideos.us/api/workouts/sso");
  assert.match(htmlRes.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await htmlRes.text(), /Try again/i);
});

test("SSO error responses never return dev_detail, emails, or handoff tokens", async () => {
  const handoffToken = "plaintext-handoff-from-query-string";
  const email = "athlete@example.test";
  const detail = `P2010 — UPDATE public.workout_cool_handoffs SET consumed_at = NOW() WHERE secret_token = '${handoffToken}' ${email}`;
  const req = new NextRequest("https://workouts.example.test/api/peptideos-wc-sso?token=x", {
    headers: { Accept: "application/json" }
  });

  assert.deepEqual(
    safeSsoErrorBody({ error: "sso_internal_error", dev_detail: detail, message: email }),
    { error: "sso_internal_error" }
  );

  const jsonRes = ssoClientError(
    req,
    { error: "sso_internal_error", dev_detail: detail, email, meta: { args: [handoffToken] } },
    500,
    "https://peptideos.us/api/workouts/sso"
  );
  const jsonBody = await jsonRes.json();
  assert.deepEqual(jsonBody, { error: "sso_internal_error" });
  assert.doesNotMatch(JSON.stringify(jsonBody), /plaintext-handoff-from-query-string|athlete@example\.test|dev_detail|secret_token/);

  const rawReq = new NextRequest("https://workouts.example.test/api/peptideos-wc-sso?token=x", {
    headers: { Accept: "application/json" }
  });
  const rawRes = ssoClientError(rawReq, { error: detail }, 500, "https://peptideos.us/api/workouts/sso");
  assert.deepEqual(await rawRes.json(), { error: "sso_internal_error" });
});
