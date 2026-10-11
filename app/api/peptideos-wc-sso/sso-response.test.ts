import { test } from "node:test";
import assert from "node:assert/strict";

import { ssoJson } from "./sso-response";

test("SSO error responses are not storeable", () => {
  const response = ssoJson({ error: "sso_email_collision" }, 409);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.status, 409);
});
