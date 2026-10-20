import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { headerAuthChrome } from "./header-auth-chrome";

test("header auth chrome is neutral while the session is pending and unchanged after", () => {
  assert.equal(headerAuthChrome(true, false), "pending");
  assert.equal(headerAuthChrome(true, true), "signed-in");
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
  assert.match(pending, /className=\{`\$\{loginLinkClass\} invisible`\}/);
  assert.match(pending, /className=\{`\$\{publicSignupClass\} invisible`\}/);
  assert.match(pending, /\{loginLabel\}/);
  assert.match(pending, /\{signupLabel\}/);
  assert.doesNotMatch(pending, /<Link/);
  assert.doesNotMatch(pending, /avatar/);
  assert.doesNotMatch(pending, /href=/);
  assert.doesNotMatch(pending, /#[0-9a-fA-F]{3,8}/);
});

test("pending and signed-out auth rows share the wrapping container classes", () => {
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const cluster = "ml-1 flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2";
  assert.match(header, new RegExp(`const authClusterClass = "${cluster}"`));
  assert.equal(header.split("className={authClusterClass}").length - 1, 2);
  const loginClass =
    "!inline-flex !min-h-12 !min-w-12 !shrink-0 items-center justify-center !text-lg !no-underline px-2 text-center";
  assert.equal(header.split(loginClass).length - 1, 2);
});
