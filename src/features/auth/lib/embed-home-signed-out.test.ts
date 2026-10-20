import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";
import { locales } from "locales/types";

import { proxy } from "../../../../proxy";

import { embedSignedOutSessionBootstrap } from "@/features/embed/lib/embed-mode";
import { shouldRedirectSignedOutRequest } from "@/features/auth/lib/signed-out-gate";

const APP = "https://workouts.peptideos.us";
const SESSION = "better-auth.session_token=1";

async function run(url: string, headers: Record<string, string> = {}) {
  const response = await proxy(new NextRequest(url, { headers }));
  const body = await response.text();
  return { response, body };
}

function assertSignedOutDocument(response: Response, body: string) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'self' https:\/\/peptideos\.us https:\/\/www\.peptideos\.us/
  );
  assert.match(body, /data-wc-embed-fallback/);
  assert.match(body, /wc:session/);
  assert.match(body, /signed-out/);
  assert.equal(body.includes(embedSignedOutSessionBootstrap()), true);
}

test("embed + / + no cookie returns the signed-out document with wc:session signed-out", async () => {
  const { response, body } = await run(`${APP}/?embed=1&theme=dark`, { "accept-language": "fr-FR,fr;q=0.9" });
  assertSignedOutDocument(response, body);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("embed + locale home + no cookie returns the signed-out document", async () => {
  for (const locale of locales) {
    const { response, body } = await run(`${APP}/${locale}?embed=1&theme=dark`, { "accept-language": locale });
    assertSignedOutDocument(response, body);
  }
});

test("embed + / + session cookie still follows the locale redirect, not the signed-out document", async () => {
  const { response, body } = await run(`${APP}/?embed=1&theme=dark`, {
    "accept-language": "en",
    cookie: SESSION
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${APP}/en?embed=1&theme=dark`);
  assert.equal(body.includes("data-wc-embed-fallback"), false);
  assert.equal(body.includes("wc:session"), false);
});

test("embed + locale home + session cookie stays on the builder path", async () => {
  for (const locale of locales) {
    const { response, body } = await run(`${APP}/${locale}?embed=1&theme=dark`, {
      "accept-language": locale,
      cookie: SESSION
    });
    assert.equal(response.status, 200, locale);
    assert.equal(response.headers.get("location"), null, locale);
    assert.equal(response.headers.get("x-next-locale"), locale, locale);
    assert.equal(body.includes("data-wc-embed-fallback"), false, locale);
    assert.equal(body.includes("wc:session"), false, locale);
  }

  const mismatched = await run(`${APP}/fr?embed=1`, {
    "accept-language": "en",
    cookie: SESSION
  });
  assert.equal(mismatched.response.status, 307);
  assert.equal(mismatched.response.headers.get("location"), `${APP}/?embed=1`);
  assert.equal(mismatched.body.includes("data-wc-embed-fallback"), false);
});

test("non-embed / with no cookie still locale-redirects", async () => {
  const french = await run(`${APP}/`, { "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" });
  assert.equal(french.response.status, 307);
  assert.equal(french.response.headers.get("location"), `${APP}/fr`);
  assert.equal(french.body.includes("data-wc-embed-fallback"), false);

  const topLevelEmbedQuery = await run(`${APP}/?embed=1`, {
    "accept-language": "en",
    "sec-fetch-dest": "document"
  });
  assert.equal(topLevelEmbedQuery.response.status, 307);
  assert.equal(topLevelEmbedQuery.response.headers.get("location"), `${APP}/en?embed=1`);
  assert.equal(topLevelEmbedQuery.body.includes("wc:session"), false);
});

test("a non-home public embed path with no cookie is unchanged", async () => {
  const about = await run(`${APP}/en/about?embed=1`, { "accept-language": "en" });
  assert.equal(about.response.status, 200);
  assert.equal(about.response.headers.get("location"), null);
  assert.equal(about.response.headers.get("x-next-locale"), "en");
  assert.equal(about.body.includes("data-wc-embed-fallback"), false);

  const unprefixed = await run(`${APP}/about?embed=1`, { "accept-language": "en" });
  assert.equal(unprefixed.response.status, 200);
  assert.equal(unprefixed.response.headers.get("location"), null);
  assert.equal(unprefixed.response.headers.get("x-middleware-rewrite"), `${APP}/en/about?embed=1`);
  assert.equal(unprefixed.body.includes("data-wc-embed-fallback"), false);
});

test("gated embed paths still return the signed-out document", async () => {
  const { response, body } = await run(`${APP}/en/profile`, { "sec-fetch-dest": "iframe" });
  assertSignedOutDocument(response, body);

  const withSession = await run(`${APP}/en/profile?embed=1`, {
    "accept-language": "en",
    cookie: SESSION
  });
  assert.equal(withSession.response.status, 200);
  assert.equal(withSession.response.headers.get("location"), null);
  assert.equal(withSession.body.includes("data-wc-embed-fallback"), false);
});

test("embed + /en/ with one trailing slash returns the signed-out document, and cookie or non-embed stays put", async () => {
  const signedOut = await run(`${APP}/en/?embed=1&theme=dark`, { "accept-language": "en" });
  assertSignedOutDocument(signedOut.response, signedOut.body);

  const withCookie = await run(`${APP}/en/?embed=1&theme=dark`, {
    "accept-language": "en",
    cookie: SESSION
  });
  assert.equal(withCookie.response.status, 200);
  assert.equal(withCookie.response.headers.get("location"), null);
  assert.equal(withCookie.response.headers.get("x-next-locale"), "en");
  assert.equal(withCookie.body.includes("data-wc-embed-fallback"), false);
  assert.equal(withCookie.body.includes("wc:session"), false);

  const plain = await run(`${APP}/en/`, { "accept-language": "en" });
  assert.equal(plain.response.status, 200);
  assert.equal(plain.response.headers.get("location"), null);
  assert.equal(plain.response.headers.get("x-next-locale"), "en");
  assert.equal(plain.body.includes("data-wc-embed-fallback"), false);

  for (const locale of ["fr", "zh-CN"]) {
    const slashed = await run(`${APP}/${locale}/?embed=1`, { "accept-language": locale });
    assertSignedOutDocument(slashed.response, slashed.body);
  }

  const deeper = await run(`${APP}/en//?embed=1`, { "accept-language": "en" });
  assert.equal(deeper.body.includes("data-wc-embed-fallback"), false);
  const doubleSlash = await run(`${APP}//?embed=1`, { "accept-language": "en" });
  assert.equal(doubleSlash.body.includes("data-wc-embed-fallback"), false);
});

test("/en-foo, //, /en//, and /en/x are rejected and are not embed-home documents", async () => {
  const proxySource = readFileSync("proxy.ts", "utf8");
  assert.match(proxySource, /pathname === `\/\$\{locale\}` \|\| pathname === `\/\$\{locale\}\/`/);
  assert.doesNotMatch(proxySource, /startsWith\(`\/\$\{locale\}/);

  // `//` and `/en//` are public, so a rejected home is not a signed-out document.
  // `/en-foo` and `/en/x` are gated unknown paths, so the signed-out gate still answers.
  for (const path of ["/en-foo", "//", "/en//", "/en/x"]) {
    const { body } = await run(`${APP}${path}?embed=1`, { "accept-language": "en" });
    const signedOutDoc = body.includes("data-wc-embed-fallback");
    const gated = shouldRedirectSignedOutRequest(path, false);
    assert.equal(path === "/" || /^\/(?:en|fr|es|zh-CN|ru|pt)\/?$/.test(path), false, path);
    assert.equal(signedOutDoc, gated, path);
    if (!gated) {
      assert.equal(signedOutDoc, false, path);
    }
  }
});

test("embed sign-out paths still return a document that posts no session", async () => {
  const { response, body } = await run(`${APP}/en/auth/signout`, { "sec-fetch-dest": "iframe" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(body, /data-wc-embed-fallback/);
  assert.doesNotMatch(body, /postMessage/);
  assert.doesNotMatch(body, /wc:session/);
  assert.doesNotMatch(body, /wc:signed-out/);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'self' https:\/\/peptideos\.us https:\/\/www\.peptideos\.us/
  );
});
