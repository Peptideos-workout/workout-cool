import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { ssoClientError, ssoJson } from "./sso-response";

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
