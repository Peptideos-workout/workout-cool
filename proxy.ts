// middleware.ts
import { createI18nMiddleware } from "next-international/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { embedSignedOutDocumentResponse, isEmbedDocumentRequest } from "@/features/embed/lib/embed-signed-out-document";
import { EMBED_COOKIE_NAME, isEmbedUnframeableSignoutPath } from "@/features/embed/lib/embed-mode";
import { applySignoutConfirmSecurityHeaders, signoutContinueProxyResponse } from "@/features/auth/signout/lib/signout-continue-proxy";
import { isSignoutConfirmPath, isSignoutContinuePath } from "@/features/auth/signout/lib/signout-continue-csp";
import { peptideOsSignedOutRedirectLocation, shouldRedirectSignedOutRequest } from "@/features/auth/lib/signed-out-gate";
import { peptideOsOrigin } from "@/features/auth/lib/peptideos-signup-url";

const SUPPORTED_LOCALES = ["en", "fr", "es", "zh-CN", "ru", "pt"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = "en";
const NEXT_LOCALE_COOKIE = "Next-Locale";

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const
};

/** RFC 9110 qvalue: 0-1 with at most three decimal places. q=0 means not acceptable. */
const ACCEPT_Q_VALUE = /^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/;

function canonicalLocale(value: string | undefined): SupportedLocale | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Longer than any supported tag (zh-CN). Rejects overlong and non-tags before the allowlist compare.
  if (!trimmed || trimmed.length > 16) return null;
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

function acceptableLanguageTags(header: string): string[] {
  const ranked: Array<{ tag: string; quality: number; index: number }> = [];
  const parts = header.split(",");

  for (let index = 0; index < parts.length; index++) {
    const [rawTag, ...params] = parts[index].split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag || tag === "*") continue;

    let quality = 1;
    let invalid = false;
    for (const param of params) {
      const trimmed = param.trim();
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim().toLowerCase();
      if (key !== "q") continue;
      const rawQuality = trimmed.slice(separator + 1).trim();
      if (!ACCEPT_Q_VALUE.test(rawQuality)) {
        invalid = true;
        break;
      }
      quality = Number(rawQuality);
      if (quality <= 0) invalid = true;
    }
    if (invalid) continue;
    ranked.push({ tag, quality, index });
  }

  ranked.sort((left, right) => right.quality - left.quality || left.index - right.index);
  return ranked.map((entry) => entry.tag);
}

function detectUserLocale(request: NextRequest): SupportedLocale {
  const acceptLanguage = request.headers.get("accept-language");
  if (!acceptLanguage || !acceptLanguage.trim()) return DEFAULT_LOCALE;

  for (const locale of acceptableLanguageTags(acceptLanguage)) {
    const exact = SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === locale);
    if (exact) return exact;

    // Language match (fr-FR -> fr, pt-BR -> pt, fr-CA -> fr)
    const primary = locale.split("-")[0];
    const primaryMatch = SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === primary);
    if (primaryMatch) return primaryMatch;

    // zh-TW, zh-HK, zh, and other Chinese tags share the supported zh-CN locale
    if (locale.startsWith("zh")) return "zh-CN";
  }

  return DEFAULT_LOCALE;
}

/**
 * Next-Locale, then detected-locale, then Accept-Language, then en.
 * Cookie values must match the allowlist case-insensitively. Anything else is ignored, never copied into a URL.
 * The root redirect must use this same value. A mismatch sends /zh-CN back to / and loops when cookies are dropped.
 */
function resolveRequestLocale(request: NextRequest): SupportedLocale {
  const fromNextLocale = canonicalLocale(request.cookies.get(NEXT_LOCALE_COOKIE)?.value);
  if (fromNextLocale) return fromNextLocale;
  const fromDetected = canonicalLocale(request.cookies.get("detected-locale")?.value);
  if (fromDetected) return fromDetected;
  return detectUserLocale(request);
}

/**
 * next-international reads Next-Locale before resolveLocaleFromRequest. A value that is not an exact
 * locales.includes match returns null and never calls the resolver, so zh-cn and garbage both become en.
 * Rewrite a case variant to its canonical tag, and drop anything outside the allowlist, before that read.
 */
function alignNextLocaleCookie(request: NextRequest): { raw: string | undefined; canonical: SupportedLocale | null } {
  const raw = request.cookies.get(NEXT_LOCALE_COOKIE)?.value;
  const canonical = canonicalLocale(raw);
  if (raw !== undefined && raw !== canonical) {
    if (canonical) request.cookies.set(NEXT_LOCALE_COOKIE, canonical);
    else request.cookies.delete(NEXT_LOCALE_COOKIE);
  }
  return { raw, canonical };
}

function setDetectedLocaleCookie(response: NextResponse, request: NextRequest, resolved: SupportedLocale) {
  const raw = request.cookies.get("detected-locale")?.value;
  const canonical = canonicalLocale(raw);
  if (canonical && raw === canonical) return;
  response.cookies.set("detected-locale", canonical ?? resolved, LOCALE_COOKIE_OPTIONS);
}

function setNextLocaleCookie(
  response: NextResponse,
  raw: string | undefined,
  canonical: SupportedLocale | null,
  resolved: SupportedLocale
) {
  if (raw === undefined) return;
  response.cookies.set(NEXT_LOCALE_COOKIE, canonical ?? resolved, { sameSite: "strict" });
}

/** Locale redirect target. Pathname gains the locale; search and hash stay as received. */
export function buildLocaleRedirectUrl(request: NextRequest, locale: string): URL {
  const url = request.nextUrl.clone();
  const suffix = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/${locale}${suffix}`;
  return url;
}

const I18nMiddleware = createI18nMiddleware({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  urlMappingStrategy: "rewrite",
  // The default resolver keeps only the primary tag, so zh-CN becomes "zh" and falls back to English.
  resolveLocaleFromRequest: resolveRequestLocale,
});

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const detectedLocale = detectUserLocale(request);
  const hasSession = Boolean(getSessionCookie(request));
  const embedded = isEmbedDocumentRequest(
    request.nextUrl.search,
    request.cookies.get(EMBED_COOKIE_NAME)?.value,
    request.headers.get("sec-fetch-dest")
  );
  const embedNeedsFallback =
    embedded && (shouldRedirectSignedOutRequest(pathname, hasSession) || isEmbedUnframeableSignoutPath(pathname));

  if (embedNeedsFallback) {
    return embedSignedOutDocumentResponse(
      process.env.NEXT_PUBLIC_PEPTIDEOS_URL,
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL,
      { postSession: !isEmbedUnframeableSignoutPath(pathname) }
    );
  }

  if (shouldRedirectSignedOutRequest(pathname, hasSession)) {
    const returnTo = `${pathname}${request.nextUrl.search}`;
    const location = peptideOsSignedOutRedirectLocation(
      process.env.NEXT_PUBLIC_PEPTIDEOS_URL,
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL,
      returnTo
    );
    const response = NextResponse.redirect(location, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (isSignoutContinuePath(pathname)) {
    return signoutContinueProxyResponse(request, {
      locale: detectedLocale,
      peptideOsOrigin: peptideOsOrigin(process.env.NEXT_PUBLIC_PEPTIDEOS_URL, process.env.NEXT_PUBLIC_APP_URL),
      appUrl: process.env.NEXT_PUBLIC_APP_URL
    });
  }

  const resolvedLocale = resolveRequestLocale(request);
  const detectedCanonical = canonicalLocale(request.cookies.get("detected-locale")?.value);

  // Root only auto-redirects until a supported detected-locale is stored. The target matches the middleware.
  if (pathname === "/" && !detectedCanonical) {
    const url = buildLocaleRedirectUrl(request, resolvedLocale);
    const response = NextResponse.redirect(url);
    const rawNextLocale = request.cookies.get(NEXT_LOCALE_COOKIE)?.value;
    setDetectedLocaleCookie(response, request, resolvedLocale);
    setNextLocaleCookie(response, rawNextLocale, canonicalLocale(rawNextLocale), resolvedLocale);
    return response;
  }

  // Normal i18n middleware processing. Normalize Next-Locale first so the library's exact-match read sees the allowlist.
  const nextLocale = alignNextLocaleCookie(request);
  const response = I18nMiddleware(request);
  setNextLocaleCookie(response, nextLocale.raw, nextLocale.canonical, resolvedLocale);
  setDetectedLocaleCookie(response, request, resolvedLocale);

  // Extract current locale from pathname
  const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)/);
  const currentLocale = localeMatch ? localeMatch[1] : detectedLocale;

  // Set Content-Language header for SEO
  response.headers.set("Content-Language", currentLocale);

  const searchParams = request.nextUrl.searchParams.toString();
  response.headers.set("searchParams", searchParams);

  if (isSignoutConfirmPath(pathname)) {
    applySignoutConfirmSecurityHeaders(response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|static|_next|manifest.json|favicon.ico|robots.txt|sw.js|apple-touch-icon.png|android-chrome-.*\\.png|images|logo|icons|sitemap.xml|ads.txt).*)",
  ],
};
