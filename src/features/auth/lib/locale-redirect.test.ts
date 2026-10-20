import { test } from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildLocaleRedirectUrl, proxy } from "../../../../proxy";

const APP = "https://workouts.peptideos.us";
const SESSION = "better-auth.session_token=1";

/** A session cookie keeps an embed home on the locale-redirect path. Without it, proxy returns the signed-out document. */
function withSession(headers: Record<string, string> = {}): Record<string, string> {
  if (headers.cookie?.includes("better-auth.session_token")) return headers;
  const cookie = headers.cookie ? `${headers.cookie}; ${SESSION}` : SESSION;
  return { ...headers, cookie };
}

test("/?embed=1 with a session cookie and a non-English Accept-Language redirects to /{locale}?embed=1", async () => {
  const french = await proxy(
    new NextRequest(`${APP}/?embed=1`, {
      headers: withSession({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" })
    })
  );
  assert.equal(french.status, 307);
  assert.equal(french.headers.get("location"), `${APP}/fr?embed=1`);

  const chinese = await proxy(
    new NextRequest(`${APP}/?embed=1`, {
      headers: withSession({ "accept-language": "zh-CN,zh;q=0.9" })
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
      headers: withSession({ "accept-language": "ru" })
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
      headers: withSession({ "accept-language": "en" })
    })
  );
  assert.equal(withQuery.status, 307);
  assert.equal(withQuery.headers.get("location"), `${APP}/en?embed=1`);
});

test("an already-localized path does not redirect", async () => {
  const french = await proxy(
    new NextRequest(`${APP}/fr?embed=1`, {
      headers: withSession({ "accept-language": "fr" })
    })
  );
  assert.equal(french.status, 200);
  assert.equal(french.headers.get("location"), null);
  assert.equal(french.headers.get("x-next-locale"), "fr");

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

    const root = await proxy(new NextRequest(`${APP}/?embed=1`, { headers: withSession(headers) }));
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

test("a session cookie on /?embed=1 with Accept-Language zh-CN settles within 2 hops and keeps embed=1", async () => {
  const headers = withSession({ "accept-language": "zh-CN,zh;q=0.9" });
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

  const nextLocalePath: Record<string, string> = {
    "Next-Locale=de": "/en",
    "Next-Locale=zh": "/en",
    "Next-Locale=zh-cn": "/en",
    "Next-Locale=": "/en",
    "Next-Locale=fr": "/fr",
    "Next-Locale=en": "/en",
    "Next-Locale=zh-CN": "/zh-CN"
  };

  for (const cookie of cookieStates) {
    const headers: Record<string, string> = { "accept-language": "zh-CN" };
    if (cookie !== undefined) headers.cookie = cookie;
    Object.assign(headers, withSession(headers));
    const label = cookie ?? "(session only)";

    if (cookie !== undefined && cookie in nextLocalePath) {
      const first = await proxy(new NextRequest(`${APP}/?embed=1`, { headers }));
      const firstLocation = first.headers.get("location");
      assert.equal(first.status, 307, label);
      if (!firstLocation) assert.fail(label);
      assert.equal(new URL(firstLocation).pathname, nextLocalePath[cookie], label);
      assert.equal(new URL(firstLocation).search, "?embed=1", label);
    }

    const settled = await followRedirects(`${APP}/?embed=1`, headers);
    const finalUrl = new URL(settled.finalUrl);
    assert.equal(settled.loop, false, label);
    assert.ok(settled.hops <= 2, `${label} settled in ${settled.hops} hops at ${settled.finalUrl}`);
    assert.equal(finalUrl.searchParams.get("embed"), "1", label);
    if (cookie !== undefined && cookie in nextLocalePath) {
      assert.equal(finalUrl.pathname, nextLocalePath[cookie], label);
    }
  }
});

const QUERY = "embed=1&x=2";

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

async function assertLocaleOnRootAndNested(headers: Record<string, string>, locale: string, label: string) {
  const root = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers: withSession(headers) }));
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

test("Accept-Language pt-BR and fr-FR on /programs/x?embed=1 rewrite to /pt and /fr", async () => {
  const cases = [
    { acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8", locale: "pt" },
    { acceptLanguage: "fr-FR,fr;q=0.9", locale: "fr" }
  ];

  for (const { acceptLanguage, locale } of cases) {
    const headers = { "accept-language": acceptLanguage };

    const root = await proxy(new NextRequest(`${APP}/?embed=1`, { headers: withSession(headers) }));
    const rootLocation = root.headers.get("location");
    assert.equal(root.status, 307, acceptLanguage);
    if (!rootLocation) assert.fail(acceptLanguage);
    const rootUrl = new URL(rootLocation);
    assert.equal(rootUrl.pathname, `/${locale}`, acceptLanguage);
    assert.equal(rootUrl.search, "?embed=1", acceptLanguage);

    const nested = await proxy(new NextRequest(`${APP}/programs/x?embed=1`, { headers }));
    const rewrite = nested.headers.get("x-middleware-rewrite");
    assert.equal(nested.status, 200, acceptLanguage);
    assert.equal(nested.headers.get("location"), null, acceptLanguage);
    assert.equal(nested.headers.get("x-next-locale"), locale, acceptLanguage);
    if (!rewrite) assert.fail(acceptLanguage);
    const rewriteUrl = new URL(rewrite);
    assert.equal(rewriteUrl.pathname, `/${locale}/programs/x`, acceptLanguage);
    assert.equal(rewriteUrl.search, "?embed=1", acceptLanguage);
  }
});

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

  const settled = await followQuery(`${APP}/?${QUERY}`, withSession({ "accept-language": "zh-CN,zh;q=0.9" }));
  assert.equal(settled.loop, false);
  assert.ok(settled.hops <= 2);
  assert.equal(new URL(settled.finalUrl).pathname, "/zh-CN");
  assertKeptQuery(settled.finalUrl, "session zh-CN");
});

test("a supported Next-Locale cookie wins over Accept-Language on / and on a nested path", async () => {
  await assertLocaleOnRootAndNested(
    { "accept-language": "zh-CN,zh;q=0.9", cookie: "Next-Locale=es" },
    "es",
    "Next-Locale=es"
  );
});

test("Next-Locale=fr on /programs/x keeps embed=1 and stores the resolved detected-locale", async () => {
  const response = await proxy(
    new NextRequest(`${APP}/programs/x?embed=1`, {
      headers: { "accept-language": "zh-CN", cookie: "Next-Locale=fr" }
    })
  );
  const rewrite = response.headers.get("x-middleware-rewrite");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-next-locale"), "fr");
  if (!rewrite) assert.fail("nested Next-Locale=fr did not rewrite");
  const rewriteUrl = new URL(rewrite);
  assert.equal(rewriteUrl.pathname, "/fr/programs/x");
  assert.equal(rewriteUrl.searchParams.get("embed"), "1");

  const detected = setCookieList(response).find((cookie) => cookie.startsWith("detected-locale="));
  assert.equal(detected?.split(";")[0], "detected-locale=fr");
});

test("q=0, malformed q, star, and blank Accept-Language do not select an unacceptable language", async () => {
  const cases = [
    { acceptLanguage: "fr;q=0", locale: "en" },
    { acceptLanguage: "fr;q=0, en", locale: "en" },
    { acceptLanguage: "fr;q=abc", locale: "en" },
    { acceptLanguage: "fr;q=abc, en", locale: "en" },
    { acceptLanguage: "en, fr;q=abc", locale: "en" },
    { acceptLanguage: "en;q=abc, fr", locale: "fr" },
    { acceptLanguage: "fr, en;q=nope", locale: "fr" },
    { acceptLanguage: "fr;q=2", locale: "en" },
    { acceptLanguage: "fr;q=-1", locale: "en" },
    { acceptLanguage: "fr; q=0.9", locale: "fr" },
    { acceptLanguage: "en;q=0.8, fr; q=0.5", locale: "en" },
    { acceptLanguage: "fr;q = 0.9", locale: "fr" },
    { acceptLanguage: "en;q=0.8, fr;q = 0.5", locale: "en" },
    { acceptLanguage: "*", locale: "en" },
    { acceptLanguage: "   ", locale: "en" },
    { acceptLanguage: "\t", locale: "en" },
    { acceptLanguage: "", locale: "en" }
  ];

  for (const { acceptLanguage, locale } of cases) {
    await assert.doesNotReject(() => assertLocaleOnRootAndNested({ "accept-language": acceptLanguage }, locale, acceptLanguage));
    const root = await proxy(new NextRequest(`${APP}/?${QUERY}`, { headers: withSession({ "accept-language": acceptLanguage }) }));
    const location = root.headers.get("location");
    if (!location) assert.fail(acceptLanguage);
    assert.equal(new URL(location).pathname, `/${locale}`, acceptLanguage);
    assertKeptQuery(location, acceptLanguage);
  }
});

test("embed=1 and other query params survive every locale redirect hop", async () => {
  const region = await followQuery(`${APP}/?${QUERY}`, withSession({ "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" }));
  assert.equal(region.loop, false);
  assert.equal(new URL(region.finalUrl).pathname, "/pt");
  assertKeptQuery(region.finalUrl, "pt-BR");
  for (const location of region.locations) assertKeptQuery(location, "pt-BR hop");

  const saved = await followQuery(`${APP}/zh-CN?${QUERY}`, withSession({ "accept-language": "en", cookie: "Next-Locale=fr" }));
  assert.equal(saved.loop, false);
  assert.ok(saved.hops <= 2, saved.finalUrl);
  assert.equal(new URL(saved.finalUrl).pathname, "/fr");
  assertKeptQuery(saved.finalUrl, "saved fr");
  assert.ok(saved.locations.length >= 1);
  for (const location of saved.locations) assertKeptQuery(location, "saved fr hop");

  const malformed = await followQuery(`${APP}/?${QUERY}`, withSession({ "accept-language": "fr;q=0, en", cookie: "Next-Locale=../" }));
  assert.equal(malformed.loop, false);
  assert.equal(new URL(malformed.finalUrl).pathname, "/en");
  assertKeptQuery(malformed.finalUrl, "q=0");
  for (const location of malformed.locations) assertKeptQuery(location, "q=0 hop");
});

test("Content-Language is the rendered locale, including on /programs and /about", async () => {
  const nestedPaths = ["/programs", "/programs/x", "/about"];

  for (const path of nestedPaths) {
    const cookieless = await proxy(
      new NextRequest(`${APP}${path}`, {
        headers: { "accept-language": "fr" }
      })
    );
    assert.equal(cookieless.headers.get("content-language"), "fr", path);
    assert.notEqual(cookieless.headers.get("content-language"), "pr", path);
    assert.notEqual(cookieless.headers.get("content-language"), "ab", path);

    const saved = await proxy(
      new NextRequest(`${APP}${path}`, {
        headers: { "accept-language": "zh-CN", cookie: "Next-Locale=fr" }
      })
    );
    assert.equal(saved.headers.get("content-language"), "fr", `${path} Next-Locale=fr`);
    assert.notEqual(saved.headers.get("content-language"), "pr", path);
    assert.notEqual(saved.headers.get("content-language"), "ab", path);
  }

  const root = await proxy(
    new NextRequest(`${APP}/`, {
      headers: { "accept-language": "zh-CN", cookie: "detected-locale=zh-CN; Next-Locale=fr" }
    })
  );
  assert.equal(root.headers.get("location"), null);
  assert.equal(root.headers.get("content-language"), "fr");

  const rootRedirect = await proxy(
    new NextRequest(`${APP}/`, {
      headers: { "accept-language": "zh-CN", cookie: "Next-Locale=fr" }
    })
  );
  const redirectLanguage = rootRedirect.headers.get("content-language");
  if (redirectLanguage !== null) assert.equal(redirectLanguage, "fr");

  const prefixed = await proxy(
    new NextRequest(`${APP}/zh-CN/programs`, {
      headers: { "accept-language": "en" }
    })
  );
  assert.equal(prefixed.headers.get("content-language"), "zh-CN");
});

test("unsupported Accept-Language falls back to English without a redirect loop", async () => {
  const headers = withSession({ "accept-language": "de-DE,de;q=0.9" });
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
