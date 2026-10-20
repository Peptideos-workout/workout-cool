import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { headerAuthChrome } from "./header-auth-chrome";

test("header auth chrome is neutral while the session is pending and unchanged after", () => {
  assert.equal(headerAuthChrome(true, false), "pending");
  assert.equal(headerAuthChrome(true, true), "pending");
  assert.equal(headerAuthChrome(false, false), "signed-out");
  assert.equal(headerAuthChrome(false, true), "signed-in");
});

test("the pending header slot reserves the auth footprint without login, signup, or avatar", () => {
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  assert.match(header, /headerAuthChrome\(session\.isPending, Boolean\(session\.data\)\)/);

  const pendingAt = header.indexOf("authChrome === \"pending\"");
  const signedOutAt = header.indexOf("authChrome === \"signed-out\"");
  assert.ok(pendingAt > 0);
  assert.ok(signedOutAt > pendingAt);
  const pending = header.slice(pendingAt, signedOutAt);
  assert.match(pending, /aria-hidden="true"/);
  assert.match(pending, /min-h-12/);
  assert.match(pending, /border-\[var\(--wc-dash-secondary\)\]/);
  assert.match(pending, /bg-\[var\(--wc-dash-panel\)\]/);
  assert.doesNotMatch(pending, /commons\.login/);
  assert.doesNotMatch(pending, /commons\.signup/);
  assert.doesNotMatch(pending, /avatar/);
  assert.doesNotMatch(pending, /href=/);
  assert.doesNotMatch(pending, /#[0-9a-fA-F]{3,8}/);
});
