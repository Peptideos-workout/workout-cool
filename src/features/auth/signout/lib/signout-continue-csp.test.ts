import { test } from "node:test";
import assert from "node:assert/strict";

import { isSignoutContinuePath, signoutContinueFormActionCsp } from "./signout-continue-csp";

const POS = "https://peptideos.us";
const WC = "https://workouts.peptideos.us";

test("signout continue CSP form-action allows the PeptideOS target and the WC origin 303", () => {
  const csp = signoutContinueFormActionCsp(POS, WC);
  assert.match(csp, /^form-action\b/);
  assert.match(csp, /'self'/);
  assert.match(csp, /https:\/\/peptideos\.us/);
  assert.match(csp, /https:\/\/workouts\.peptideos\.us/);
  assert.doesNotMatch(csp, /\*/);
  assert.doesNotMatch(csp, /https:\/\/evil\.example/);
});

test("signout continue CSP includes a local PeptideOS origin and local WC origin", () => {
  const csp = signoutContinueFormActionCsp("http://localhost:4000", "http://localhost:3010");
  assert.match(csp, /http:\/\/localhost:4000/);
  assert.match(csp, /http:\/\/localhost:3010/);
  assert.match(csp, /'self'/);
});

test("isSignoutContinuePath matches locale-prefixed hop B continue pages only", () => {
  assert.equal(isSignoutContinuePath("/auth/signout/continue"), true);
  assert.equal(isSignoutContinuePath("/en/auth/signout/continue"), true);
  assert.equal(isSignoutContinuePath("/fr/auth/signout/continue/"), true);
  assert.equal(isSignoutContinuePath("/auth/signout"), false);
  assert.equal(isSignoutContinuePath("/auth/signout/continue/extra"), false);
  assert.equal(isSignoutContinuePath("/profile"), false);
});
