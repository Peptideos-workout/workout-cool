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

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function detectUserLocale(request: NextRequest): SupportedLocale {
  const acceptLanguage = request.headers.get("accept-language");

  if (!acceptLanguage) return DEFAULT_LOCALE;

  // Parse Accept-Language header
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [locale, quality = "1"] = lang.trim().split(";q=");
      return { locale: locale.toLowerCase(), quality: parseFloat(quality) };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { locale } of languages) {
    const exact = SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === locale);
    if (exact) return exact;

    // Language match (fr-FR -> fr, fr-CA -> fr)
    const primary = locale.split("-")[0];
    const primaryMatch = SUPPORTED_LOCALES.find((supported) => supported.toLowerCase() === primary);
    if (primaryMatch) return primaryMatch;

    // zh-TW, zh-HK, zh, and other Chinese tags share the supported zh-CN locale
    if (locale.startsWith("zh")) return "zh-CN";
  }

  return DEFAULT_LOCALE;
}

/**
 * Locale next-international will apply: a supported Next-Locale cookie, else Accept-Language, else default.
 * The root redirect must use this same value. A mismatch sends /zh-CN back to / and loops when cookies are dropped.
 */
function resolveRequestLocale(request: NextRequest, detectedLocale: SupportedLocale): SupportedLocale {
  const cookieLocale = request.cookies.get(NEXT_LOCALE_COOKIE)?.value;
  const candidate = cookieLocale ?? detectedLocale;
  if (!candidate || !isSupportedLocale(candidate)) {
    return DEFAULT_LOCALE;
  }
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

  // If on root path and no locale detected yet, redirect to the locale the i18n middleware agrees with
  if (pathname === "/" && !request.cookies.get("detected-locale")) {
    const locale = resolveRequestLocale(request, detectedLocale);
    const url = buildLocaleRedirectUrl(request, locale);
    const response = NextResponse.redirect(url);

    response.cookies.set("detected-locale", locale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  }

  // Normal i18n middleware processing
  const response = I18nMiddleware(request);

  // Extract current locale from pathname
  const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)/);
  const currentLocale = localeMatch ? localeMatch[1] : detectedLocale;

  // Set Content-Language header for SEO
  response.headers.set("Content-Language", currentLocale);

  // Store detected locale in cookie for future visits
  if (!request.cookies.get("detected-locale")) {
    response.cookies.set("detected-locale", detectedLocale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
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
