import { test } from "node:test";
import assert from "node:assert/strict";

import { trustedPeptideOsHref } from "./trusted-peptideos-href";

const ORIGIN = "https://peptideos.us";

test("keeps an http(s) href on the configured PeptideOS origin", () => {
  assert.equal(
    trustedPeptideOsHref("https://peptideos.us/settings?redirect=https%3A%2F%2Fworkouts.peptideos.us%2Fprofile#password", ORIGIN),
    "https://peptideos.us/settings?redirect=https%3A%2F%2Fworkouts.peptideos.us%2Fprofile#password"
  );
  assert.equal(trustedPeptideOsHref("http://peptideos.us/settings#password", "http://peptideos.us"), "http://peptideos.us/settings#password");
});

test("drops hrefs that are not the configured PeptideOS origin or not http(s)", () => {
  assert.equal(trustedPeptideOsHref("https://evil.example/settings#password", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("https://peptideos.us.evil.example/settings", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("javascript:alert(1)", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("data:text/html,phish", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("//evil.example/settings", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("https://user:pass@peptideos.us/settings", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref("/settings#password", ORIGIN), undefined);
  assert.equal(trustedPeptideOsHref(undefined, ORIGIN), undefined);
});
