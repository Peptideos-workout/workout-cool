import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifySecFetchSite,
  forbiddenOriginCategory,
  forbiddenOriginLogRecord,
  logForbiddenOrigin
} from "./forbidden-origin-category";

const TOKEN = "handoff-token-9f3c1a7b";
const ORIGIN_URL = `https://evil.example/steal?token=${TOKEN}`;
const REFERER_URL = `https://www.peptideos.us/dashboard?token=${TOKEN}&next=/secret`;

test("categorizes a missing Origin", () => {
  for (const origin of [null, undefined, ""]) {
    assert.equal(forbiddenOriginCategory(origin), "missing");
  }
});

test("categorizes the literal null Origin", () => {
  assert.equal(forbiddenOriginCategory("null"), "null");
  assert.equal(forbiddenOriginCategory("NULL"), "other_host");
  assert.equal(forbiddenOriginCategory("null "), "other_host");
});

test("categorizes https://www.peptideos.us as www", () => {
  assert.equal(forbiddenOriginCategory("https://www.peptideos.us"), "www");
  assert.equal(forbiddenOriginCategory("https://www.peptideos.us/"), "other_host");
  assert.equal(forbiddenOriginCategory("https://WWW.peptideos.us"), "other_host");
  assert.equal(forbiddenOriginCategory("https://www.peptideos.us:443"), "other_host");
});

test("categorizes http:// of an allowed PeptideOS host", () => {
  assert.equal(forbiddenOriginCategory("http://peptideos.us"), "http");
  assert.equal(forbiddenOriginCategory("http://www.peptideos.us"), "http");
  assert.equal(forbiddenOriginCategory("http://peptideos.us/"), "other_host");
  assert.equal(forbiddenOriginCategory("http://peptideos.us:80"), "other_host");
  assert.equal(forbiddenOriginCategory("HTTP://peptideos.us"), "other_host");
  assert.equal(forbiddenOriginCategory("http://workouts.peptideos.us"), "other_host");
  assert.equal(forbiddenOriginCategory("http://evil.example"), "other_host");
});

test("categorizes every other Origin as other_host", () => {
  for (const origin of [
    "https://peptideos.us",
    "https://evil.example",
    "https://peptideos.us.evil.test",
    "https://www.peptideos.us.evil.test",
    "https://user:pass@peptideos.us",
    ORIGIN_URL,
    " https://www.peptideos.us"
  ]) {
    assert.equal(forbiddenOriginCategory(origin), "other_host", origin);
  }
});

test("keeps only the standard Sec-Fetch-Site tokens", () => {
  for (const token of ["same-origin", "same-site", "cross-site", "none"] as const) {
    assert.equal(classifySecFetchSite(token), token);
  }
  for (const missing of [null, undefined, ""]) {
    assert.equal(classifySecFetchSite(missing), "missing");
  }
  for (const other of ["cross-origin", "SAME-ORIGIN", "none ", " same-site", ORIGIN_URL, "null", TOKEN]) {
    assert.equal(classifySecFetchSite(other), "other", other);
  }
});

test("a token or URL in Origin or Referer never appears in the logged object", () => {
  const record = forbiddenOriginLogRecord({
    origin: ORIGIN_URL,
    secFetchSite: `cross-site ${TOKEN}`,
    referer: REFERER_URL,
    method: `POST?token=${TOKEN}`
  });
  const logged = JSON.stringify(record);

  assert.deepEqual(record, {
    origin_category: "other_host",
    sec_fetch_site: "other",
    has_referer: true,
    method: "other"
  });
  assert.deepEqual(Object.keys(record), ["origin_category", "sec_fetch_site", "has_referer", "method"]);
  assert.doesNotMatch(logged, new RegExp(TOKEN));
  assert.doesNotMatch(logged, /evil\.example/);
  assert.doesNotMatch(logged, /peptideos\.us/);
  assert.doesNotMatch(logged, /dashboard/);
  assert.doesNotMatch(logged, /https?:/);
  assert.doesNotMatch(logged, /token=/);
  assert.equal(logged.includes(ORIGIN_URL), false);
  assert.equal(logged.includes(REFERER_URL), false);

  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    logForbiddenOrigin({
      origin: ORIGIN_URL,
      secFetchSite: "cross-site",
      referer: REFERER_URL,
      method: "POST"
    });
  } finally {
    console.warn = original;
  }

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /^\[sso\] forbidden_origin /);
  assert.doesNotMatch(lines[0] ?? "", new RegExp(TOKEN));
  assert.doesNotMatch(lines[0] ?? "", /evil\.example/);
  assert.doesNotMatch(lines[0] ?? "", /peptideos\.us/);
  assert.doesNotMatch(lines[0] ?? "", /https?:/);
  assert.deepEqual(JSON.parse((lines[0] ?? "").slice("[sso] forbidden_origin ".length)), {
    origin_category: "other_host",
    sec_fetch_site: "cross-site",
    has_referer: true,
    method: "POST"
  });
});

test("has_referer is presence only and the method stays a short uppercase token", () => {
  assert.equal(
    forbiddenOriginLogRecord({ origin: null, secFetchSite: null, referer: null, method: "POST" }).has_referer,
    false
  );
  assert.equal(
    forbiddenOriginLogRecord({ origin: null, secFetchSite: null, referer: "", method: "GET" }).has_referer,
    false
  );
  assert.equal(
    forbiddenOriginLogRecord({ origin: "null", secFetchSite: "none", referer: " ", method: "OPTIONS" }).has_referer,
    true
  );
  assert.equal(forbiddenOriginLogRecord({ origin: null, secFetchSite: "none", referer: null, method: "POST" }).method, "POST");
  assert.equal(
    forbiddenOriginLogRecord({ origin: null, secFetchSite: "none", referer: null, method: "GET /secret" }).method,
    "other"
  );
});
