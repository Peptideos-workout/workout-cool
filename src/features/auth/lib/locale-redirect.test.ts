import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildLocaleRedirectUrl, proxy } from "../../../../proxy";

const APP = "https://workouts.peptideos.us";

test("/?embed=1 with a non-English Accept-Language redirects to /{locale}?embed=1", async () => {
  const french = await proxy(
    new NextRequest(`${APP}/?embed=1`, {
      headers: { "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" }
    })
  );
  assert.equal(french.status, 307);
  assert.equal(french.headers.get("location"), `${APP}/fr?embed=1`);

  const chinese = await proxy(
    new NextRequest(`${APP}/?embed=1`, {
      headers: { "accept-language": "zh-CN,zh;q=0.9" }
    })
  );
  assert.equal(chinese.status, 307);
  assert.equal(chinese.headers.get("location"), `${APP}/zh-CN?embed=1`);
});

test("a path plus several params keeps every param in order", () => {
  const request = new NextRequest(`${APP}/dashboard?embed=1&x=2`);
  const url = buildLocaleRedirectUrl(request, "es");

  assert.equal(url.pathname, "/es/dashboard");
  assert.equal(url.search, "?embed=1&x=2");
  assert.equal(url.toString(), `${APP}/es/dashboard?embed=1&x=2`);
});

test("no query string means no stray question mark", async () => {
  const response = await proxy(
    new NextRequest(`${APP}/`, {
      headers: { "accept-language": "pt-BR,pt;q=0.8" }
    })
  );
  const location = response.headers.get("location");

  assert.equal(response.status, 307);
  assert.equal(location, `${APP}/pt`);
  assert.equal(location?.includes("?"), false);

  const pathOnly = buildLocaleRedirectUrl(new NextRequest(`${APP}/dashboard`), "pt");
  assert.equal(pathOnly.toString(), `${APP}/pt/dashboard`);
  assert.equal(pathOnly.search, "");
});

test("locale redirect keeps the hash when one is present", async () => {
  const response = await proxy(
    new NextRequest(`${APP}/?embed=1#sets`, {
      headers: { "accept-language": "ru" }
    })
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${APP}/ru?embed=1#sets`);

  const pathHash = buildLocaleRedirectUrl(new NextRequest(`${APP}/dashboard?embed=1&x=2#block`), "fr");
  assert.equal(pathHash.toString(), `${APP}/fr/dashboard?embed=1&x=2#block`);
});

test("english or default locale behavior is unchanged", async () => {
  const english = await proxy(
    new NextRequest(`${APP}/`, {
      headers: { "accept-language": "en-US,en;q=0.9" }
    })
  );
  assert.equal(english.status, 307);
  assert.equal(english.headers.get("location"), `${APP}/en`);

  const fallback = await proxy(new NextRequest(`${APP}/`));
  assert.equal(fallback.status, 307);
  assert.equal(fallback.headers.get("location"), `${APP}/en`);

  const withQuery = await proxy(
    new NextRequest(`${APP}/?embed=1`, {
      headers: { "accept-language": "en" }
    })
  );
  assert.equal(withQuery.status, 307);
  assert.equal(withQuery.headers.get("location"), `${APP}/en?embed=1`);
});

test("an already-localized path does not redirect", async () => {
  const french = await proxy(
    new NextRequest(`${APP}/fr?embed=1`, {
      headers: { "accept-language": "fr" }
    })
  );
  assert.equal(french.status, 200);
  assert.equal(french.headers.get("location"), null);

  const english = await proxy(
    new NextRequest(`${APP}/en/about`, {
      headers: { "accept-language": "en" }
    })
  );
  assert.equal(english.status, 200);
  assert.equal(english.headers.get("location"), null);

  const spanish = await proxy(
    new NextRequest(`${APP}/es/programs?embed=1&x=2`, {
      headers: { "accept-language": "es-ES,es;q=0.9" }
    })
  );
  assert.equal(spanish.status, 200);
  assert.equal(spanish.headers.get("location"), null);
});
