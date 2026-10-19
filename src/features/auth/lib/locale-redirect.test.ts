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

  const root = buildLocaleRedirectUrl(new NextRequest(`${APP}/?embed=1&x=2`), "es");
  assert.equal(root.pathname, "/es");
  assert.equal(root.search, "?embed=1&x=2");
  assert.equal(root.toString(), `${APP}/es?embed=1&x=2`);
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

  const root = buildLocaleRedirectUrl(new NextRequest(`${APP}/`), "fr");
  assert.equal(root.pathname, "/fr");
  assert.equal(root.search, "");
  assert.equal(root.toString(), `${APP}/fr`);
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

  const rootHash = buildLocaleRedirectUrl(new NextRequest(`${APP}/?embed=1&x=2#block`), "fr");
  assert.equal(rootHash.pathname, "/fr");
  assert.equal(rootHash.toString(), `${APP}/fr?embed=1&x=2#block`);
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

const NESTED_PATH = "/programs/x";

interface SettledRedirect {
  hops: number;
  loop: boolean;
  finalUrl: string;
  status: number;
}

async function followRedirects(startUrl: string, headers: Record<string, string>): Promise<SettledRedirect> {
  let current = startUrl;
  const seen: string[] = [];

  for (let hop = 0; hop < 6; hop++) {
    if (seen.includes(current)) {
      return { hops: hop, loop: true, finalUrl: current, status: 307 };
    }
    seen.push(current);

    const response = await proxy(new NextRequest(current, { headers }));
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return { hops: hop, loop: false, finalUrl: current, status: response.status };
    }

    current = new URL(location, current).toString();
  }

  return { hops: 6, loop: true, finalUrl: current, status: 307 };
}

test("zh-CN, zh-TW, zh, and fr-CA resolve to the same locale on / and on a nested path", async () => {
  const cases = [
    { acceptLanguage: "zh-CN,zh;q=0.9", locale: "zh-CN" },
    { acceptLanguage: "zh-TW,zh;q=0.8,en;q=0.5", locale: "zh-CN" },
    { acceptLanguage: "zh", locale: "zh-CN" },
    { acceptLanguage: "fr-CA,fr;q=0.9,en;q=0.8", locale: "fr" }
  ];

  for (const { acceptLanguage, locale } of cases) {
    const headers = { "accept-language": acceptLanguage };

    const root = await proxy(new NextRequest(`${APP}/?embed=1`, { headers }));
    const rootLocation = root.headers.get("location");
    assert.equal(root.status, 307, acceptLanguage);
    if (!rootLocation) assert.fail(acceptLanguage);
    const rootUrl = new URL(rootLocation);
    assert.equal(rootUrl.pathname, `/${locale}`, acceptLanguage);
    assert.equal(rootUrl.searchParams.get("embed"), "1", acceptLanguage);

    const nested = await proxy(new NextRequest(`${APP}${NESTED_PATH}?embed=1`, { headers }));
    const rewrite = nested.headers.get("x-middleware-rewrite");
    assert.equal(nested.status, 200, acceptLanguage);
    assert.equal(nested.headers.get("location"), null, acceptLanguage);
    assert.equal(nested.headers.get("x-next-locale"), locale, acceptLanguage);
    if (!rewrite) assert.fail(acceptLanguage);
    const rewriteUrl = new URL(rewrite);
    assert.equal(rewriteUrl.pathname, `/${locale}${NESTED_PATH}`, acceptLanguage);
    assert.equal(rewriteUrl.searchParams.get("embed"), "1", acceptLanguage);
  }
});

test("cookieless /?embed=1 with Accept-Language zh-CN settles within 2 hops and keeps embed=1", async () => {
  const headers = { "accept-language": "zh-CN,zh;q=0.9" };
  const settled = await followRedirects(`${APP}/?embed=1`, headers);
  const finalUrl = new URL(settled.finalUrl);

  assert.equal(settled.loop, false);
  assert.ok(settled.hops <= 2, `settled in ${settled.hops} hops at ${settled.finalUrl}`);
  assert.equal(finalUrl.pathname, "/zh-CN");
  assert.equal(finalUrl.searchParams.get("embed"), "1");

  const again = await proxy(new NextRequest(settled.finalUrl, { headers }));
  assert.equal(again.headers.get("location"), null);
});

test("zh-CN /?embed=1 does not redirect-loop for any detected-locale or Next-Locale cookie state", async () => {
  const cookieStates = [
    undefined,
    "detected-locale=zh-CN",
    "detected-locale=en",
    "detected-locale=fr",
    "detected-locale=",
    "Next-Locale=zh-CN",
    "Next-Locale=en",
    "Next-Locale=fr",
    "Next-Locale=de",
    "Next-Locale=zh",
    "Next-Locale=zh-cn",
    "Next-Locale=",
    "detected-locale=zh-CN; Next-Locale=en",
    "detected-locale=en; Next-Locale=zh-CN",
    "detected-locale=fr; Next-Locale=fr"
  ];

  for (const cookie of cookieStates) {
    const headers: Record<string, string> = { "accept-language": "zh-CN" };
    if (cookie !== undefined) headers.cookie = cookie;

    const settled = await followRedirects(`${APP}/?embed=1`, headers);
    const finalUrl = new URL(settled.finalUrl);
    assert.equal(settled.loop, false, cookie ?? "(no cookies)");
    assert.ok(settled.hops <= 2, `${cookie ?? "(no cookies)"} settled in ${settled.hops} hops at ${settled.finalUrl}`);
    assert.equal(finalUrl.searchParams.get("embed"), "1", cookie ?? "(no cookies)");
  }
});

const QUERY = "embed=1&x=2";
const ALLOWED_LOCALES = ["en", "fr", "es", "zh-CN", "ru", "pt"];

function assertKeptQuery(url: string, label: string) {
  const parsed = new URL(url, APP);
  assert.equal(parsed.search, `?${QUERY}`, label);
  assert.equal(parsed.searchParams.get("embed"), "1", label);
  assert.equal(parsed.searchParams.get("x"), "2", label);
}

function setCookieList(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function assertLocaleCookieValues(response: Response, raw: string) {
  const location = response.headers.get("location") ?? "";
  const rewrite = response.headers.get("x-middleware-rewrite") ?? "";
  for (const cookie of setCookieList(response)) {
    const pair = cookie.split(";")[0] ?? "";
    const value = pair.slice(pair.indexOf("=") + 1);
    assert.notEqual(value, raw, cookie);
    if (pair.startsWith("Next-Locale=") || pair.startsWith("detected-locale=")) {
      assert.ok(ALLOWED_LOCALES.includes(value), cookie);
    }
  }
  if (raw && (raw.length > 5 || raw.includes("<") || raw.includes("..") || raw.includes("/"))) {
    assert.equal(location.includes(raw), false, raw);
    assert.equal(rewrite.includes(raw), false, raw);
    for (const cookie of setCookieList(response)) {
      assert.equal(cookie.includes(raw), false, raw);
    }
  }
}

async function assertLocaleOnRootAndNested(headers: Record<string, string>, locale: string, label: string) {
  const root = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers }));
  const rootLocation = root.headers.get("location");
  if (rootLocation) {
    assert.equal(root.status, 307, label);
    const rootUrl = new URL(rootLocation);
    assert.equal(rootUrl.pathname, `/${locale}`, label);
    assertKeptQuery(rootLocation, label);
  } else {
    const rootRewrite = root.headers.get("x-middleware-rewrite");
    assert.equal(root.status, 200, label);
    assert.equal(root.headers.get("x-next-locale"), locale, label);
    if (!rootRewrite) assert.fail(label);
    assert.equal(new URL(rootRewrite).pathname, `/${locale}`, label);
    assertKeptQuery(rootRewrite, label);
  }

  const nested = await proxy(new NextRequest(`${APP}${NESTED_PATH}?${QUERY}`, { headers }));
  const rewrite = nested.headers.get("x-middleware-rewrite");
  const nestedLocation = nested.headers.get("location");
  if (nestedLocation) {
    assertKeptQuery(nestedLocation, `${label} nested redirect`);
  } else {
    assert.equal(nested.status, 200, label);
    assert.equal(nested.headers.get("x-next-locale"), locale, label);
    if (!rewrite) assert.fail(label);
    assert.equal(new URL(rewrite).pathname, `/${locale}${NESTED_PATH}`, label);
    assertKeptQuery(rewrite, label);
  }
}

async function followQuery(startUrl: string, headers: Record<string, string>) {
  let current = startUrl;
  const seen: string[] = [];
  const locations: string[] = [];

  for (let hop = 0; hop < 6; hop++) {
    if (seen.includes(current)) return { loop: true, hops: hop, finalUrl: current, locations };
    seen.push(current);
    const response = await proxy(new NextRequest(current, { headers }));
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return { loop: false, hops: hop, finalUrl: current, locations, status: response.status };
    }
    assertKeptQuery(location, current);
    locations.push(location);
    current = new URL(location, current).toString();
  }

  return { loop: true, hops: 6, finalUrl: current, locations };
}

test("pt-BR and fr-FR with q-values resolve to pt and fr on / and on a nested path", async () => {
  const cases = [
    { acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8", locale: "pt" },
    { acceptLanguage: "fr-FR,fr;q=0.9", locale: "fr" },
    { acceptLanguage: "zh-CN,zh;q=0.9", locale: "zh-CN" },
    { acceptLanguage: "zh", locale: "zh-CN" }
  ];

  for (const { acceptLanguage, locale } of cases) {
    await assertLocaleOnRootAndNested({ "accept-language": acceptLanguage }, locale, acceptLanguage);
  }

  const settled = await followQuery(`${APP}/?${QUERY}`, { "accept-language": "zh-CN,zh;q=0.9" });
  assert.equal(settled.loop, false);
  assert.ok(settled.hops <= 2);
  assert.equal(new URL(settled.finalUrl).pathname, "/zh-CN");
  assertKeptQuery(settled.finalUrl, "cookieless zh-CN");
});

test("a supported detected-locale or Next-Locale cookie wins over Accept-Language on / and nested paths", async () => {
  const cases = [
    { cookie: "detected-locale=fr", locale: "fr" },
    { cookie: "Next-Locale=es", locale: "es" },
    { cookie: "detected-locale=pt; Next-Locale=ru", locale: "ru" },
    { cookie: "detected-locale=FR", locale: "fr" }
  ];

  for (const { cookie, locale } of cases) {
    await assertLocaleOnRootAndNested(
      { "accept-language": "zh-CN,zh;q=0.9", cookie },
      locale,
      cookie
    );
  }
});

test("Next-Locale=zh-cn is honored as canonical zh-CN on nested paths", async () => {
  const headers = { "accept-language": "en", cookie: "Next-Locale=zh-cn" };
  await assertLocaleOnRootAndNested(headers, "zh-CN", "Next-Locale=zh-cn");

  const nested = await proxy(new NextRequest(`${APP}${NESTED_PATH}?${QUERY}`, { headers }));
  const cookies = setCookieList(nested).join("\n");
  assert.match(cookies, /Next-Locale=zh-CN/);
  assert.equal(cookies.includes("zh-cn"), false);
  assertLocaleCookieValues(nested, "zh-cn");
});

test("garbage locale cookies fall back to an allowlisted locale and are never reflected", async () => {
  const garbage = ["de", "xx", "../", "z".repeat(180), "", "<script>"];

  for (const raw of garbage) {
    for (const name of ["Next-Locale", "detected-locale"]) {
      const headers = { "accept-language": "fr", cookie: `${name}=${raw}` };
      const label = `${name}=${raw}`;
      await assertLocaleOnRootAndNested(headers, "fr", label);

      const root = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers }));
      assertLocaleCookieValues(root, raw);
      const nested = await proxy(new NextRequest(`${APP}${NESTED_PATH}?${QUERY}`, { headers }));
      assertLocaleCookieValues(nested, raw);

      const settled = await followQuery(`${APP}/?${QUERY}`, headers);
      assert.equal(settled.loop, false, label);
      assert.ok(settled.hops <= 2, label);
      assertKeptQuery(settled.finalUrl, label);
    }
  }

  const starred = { "accept-language": "*", cookie: "Next-Locale=<script>" };
  await assertLocaleOnRootAndNested(starred, "en", "script cookie with star");
  const starredRoot = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers: starred }));
  assertLocaleCookieValues(starredRoot, "<script>");
});

test("q=0, malformed q, star, and blank Accept-Language do not select an unacceptable language", async () => {
  const cases = [
    { acceptLanguage: "fr;q=0, en", locale: "en" },
    { acceptLanguage: "fr;q=abc", locale: "en" },
    { acceptLanguage: "fr;q=2", locale: "en" },
    { acceptLanguage: "fr;q=-1", locale: "en" },
    { acceptLanguage: "fr;q=abc, en;q=0.4", locale: "en" },
    { acceptLanguage: "*", locale: "en" },
    { acceptLanguage: "   ", locale: "en" },
    { acceptLanguage: "\t", locale: "en" },
    { acceptLanguage: "", locale: "en" }
  ];

  for (const { acceptLanguage, locale } of cases) {
    await assert.doesNotReject(() => assertLocaleOnRootAndNested({ "accept-language": acceptLanguage }, locale, acceptLanguage));
    const root = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers: { "accept-language": acceptLanguage } }));
    const location = root.headers.get("location");
    if (!location) assert.fail(acceptLanguage);
    assert.equal(new URL(location).pathname, `/${locale}`, acceptLanguage);
    assert.notEqual(new URL(location).pathname, "/fr", acceptLanguage);
    assertKeptQuery(location, acceptLanguage);
  }
});

test("embed=1 and other query params survive every locale redirect hop", async () => {
  const region = await followQuery(`${APP}/?${QUERY}`, { "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" });
  assert.equal(region.loop, false);
  assert.equal(new URL(region.finalUrl).pathname, "/pt");
  assertKeptQuery(region.finalUrl, "pt-BR");
  for (const location of region.locations) assertKeptQuery(location, "pt-BR hop");

  const saved = await followQuery(`${APP}/zh-CN?${QUERY}`, { "accept-language": "en", cookie: "Next-Locale=fr" });
  assert.equal(saved.loop, false);
  assert.ok(saved.hops <= 2, saved.finalUrl);
  assert.equal(new URL(saved.finalUrl).pathname, "/fr");
  assertKeptQuery(saved.finalUrl, "saved fr");
  assert.ok(saved.locations.length >= 1);
  for (const location of saved.locations) assertKeptQuery(location, "saved fr hop");

  const malformed = await followQuery(`${APP}/?${QUERY}`, { "accept-language": "fr;q=0, en", cookie: "Next-Locale=../" });
  assert.equal(malformed.loop, false);
  assert.equal(new URL(malformed.finalUrl).pathname, "/en");
  assertKeptQuery(malformed.finalUrl, "q=0");
  for (const location of malformed.locations) assertKeptQuery(location, "q=0 hop");
});

test("unsupported Accept-Language falls back to English without a redirect loop", async () => {
  const headers = { "accept-language": "de-DE,de;q=0.9" };
  const settled = await followRedirects(`${APP}/?embed=1`, headers);
  const finalUrl = new URL(settled.finalUrl);

  assert.equal(settled.loop, false);
  assert.ok(settled.hops <= 2, `settled in ${settled.hops} hops at ${settled.finalUrl}`);
  assert.equal(finalUrl.pathname, "/en");
  assert.equal(finalUrl.searchParams.get("embed"), "1");

  const again = await proxy(new NextRequest(settled.finalUrl, { headers }));
  assert.equal(again.headers.get("location"), null);

  const nested = await proxy(new NextRequest(`${APP}${NESTED_PATH}`, { headers }));
  const rewrite = nested.headers.get("x-middleware-rewrite");
  assert.equal(nested.status, 200);
  assert.equal(nested.headers.get("location"), null);
  assert.equal(nested.headers.get("x-next-locale"), "en");
  if (!rewrite) assert.fail("nested unsupported locale did not rewrite");
  assert.equal(new URL(rewrite).pathname, `/en${NESTED_PATH}`);
});
