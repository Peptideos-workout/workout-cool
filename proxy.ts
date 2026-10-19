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

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function qualityFromAcceptParam(param: string): number | undefined {
  const trimmed = param.trim();
  const match = trimmed.match(/^q\s*=\s*(.*)$/i);
  if (!match) return undefined;
  const parsed = Number(match[1].trim());
  // q=0 is not acceptable. NaN and out-of-range values count as 0 so header order cannot revive them.
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return 0;
  return parsed;
}

function detectUserLocale(request: NextRequest): SupportedLocale {
  const acceptLanguage = request.headers.get("accept-language");
  if (!acceptLanguage || !acceptLanguage.trim()) return DEFAULT_LOCALE;

  const languages = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [rawLocale, ...params] = part.split(";");
      const locale = rawLocale.trim().toLowerCase();
      let quality = 1;
      for (const param of params) {
        const parsed = qualityFromAcceptParam(param);
        if (parsed !== undefined) quality = parsed;
      }
      return { locale, quality, index };
    })
    .filter((entry) => entry.locale && entry.locale !== "*" && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const { locale } of languages) {
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
 * Missing Next-Locale uses Accept-Language. A present cookie is kept only on an exact match;
 * zh-cn is not zh-CN. Unsupported and empty cookies fall back to en and do not use Accept-Language.
 * next-international rejects zh-cn on nested paths, so folding it only on / would redirect to /zh-CN
 * and bounce back to /.
 */
function resolveRequestLocale(request: NextRequest): SupportedLocale {
  const cookieLocale = request.cookies.get(NEXT_LOCALE_COOKIE)?.value;
  const candidate = cookieLocale ?? detectUserLocale(request);
  if (!candidate || !isSupportedLocale(candidate)) return DEFAULT_LOCALE;
  return candidate;
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
  resolveLocaleFromRequest: detectUserLocale,
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

  // Root only auto-redirects until detected-locale is stored. The target matches resolveRequestLocale.
  if (pathname === "/" && !request.cookies.get("detected-locale")) {
    const url = buildLocaleRedirectUrl(request, resolvedLocale);
    const response = NextResponse.redirect(url);
    response.cookies.set("detected-locale", resolvedLocale, LOCALE_COOKIE_OPTIONS);
    return response;
  }

  // Normal i18n middleware processing. The library reads Next-Locale before detectUserLocale.
  const response = I18nMiddleware(request);

  // Extract current locale from pathname
  const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)/);
  const currentLocale = localeMatch ? localeMatch[1] : detectedLocale;

  // Set Content-Language header for SEO
  response.headers.set("Content-Language", currentLocale);

  if (!request.cookies.get("detected-locale")) {
    response.cookies.set("detected-locale", resolvedLocale, LOCALE_COOKIE_OPTIONS);
  }

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
