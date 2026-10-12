import { NextResponse } from "next/server";

import {
  SIGNOUT_CONTINUE_COOKIE,
  SIGNOUT_CONTINUE_HOST_COOKIE,
  SIGNOUT_CONTINUE_OK_HEADER,
  consumeSignoutContinueToken,
  readSignoutContinueCookie,
  readSignoutContinueDecision,
  signSignoutContinueDecision,
  signoutContinueCookieOptions
} from "./signout-continue-token";
import { signoutContinueContentSecurityPolicy } from "./signout-continue-csp";

import type { NextRequest } from "next/server";

export function prepareSignoutContinueRequestHeaders(
  request: { headers: Headers; cookies: { get: (name: string) => { value: string } | undefined } },
  consume: typeof consumeSignoutContinueToken = consumeSignoutContinueToken
): { headers: Headers; autoSubmit: boolean } {
  const headers = new Headers(request.headers);
  const reused = readSignoutContinueDecision(headers.get(SIGNOUT_CONTINUE_OK_HEADER));
  headers.delete(SIGNOUT_CONTINUE_OK_HEADER);

  const autoSubmit = reused !== null ? reused : consume(readSignoutContinueCookie(request.cookies));
  const signed = signSignoutContinueDecision(autoSubmit);
  if (signed) {
    headers.set(SIGNOUT_CONTINUE_OK_HEADER, signed);
  }
  return { headers, autoSubmit };
}

export function clearSignoutContinueCookies(response: NextResponse) {
  response.cookies.set(SIGNOUT_CONTINUE_COOKIE, "", { ...signoutContinueCookieOptions(false), maxAge: 0 });
  response.cookies.set(SIGNOUT_CONTINUE_HOST_COOKIE, "", { ...signoutContinueCookieOptions(true), maxAge: 0 });
}

export function applySignoutContinueSecurityHeaders(response: NextResponse, peptideOsOrigin: string, appUrl?: string) {
  response.headers.set("Content-Security-Policy", signoutContinueContentSecurityPolicy(peptideOsOrigin, appUrl));
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cache-Control", "private, no-store");
}

/**
 * Forward the consume result to the RSC via NextResponse.next/rewrite `{ request: { headers } }`.
 * Strips any client-supplied copy of the internal header first.
 */
export function signoutContinueForwardResponse(request: NextRequest, requestHeaders: Headers, localePrefixedUrl: URL): NextResponse {
  return request.nextUrl.pathname === localePrefixedUrl.pathname
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.rewrite(localePrefixedUrl, { request: { headers: requestHeaders } });
}

const SUPPORTED_LOCALES = ["en", "fr", "es", "zh-CN", "ru", "pt"] as const;

export function localeFromContinuePath(pathname: string, fallback: string): string {
  const match = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i);
  if (!match) {
    return fallback;
  }
  const raw = match[1];
  if (raw.toLowerCase() === "zh-cn") {
    return "zh-CN";
  }
  const lower = raw.toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(lower) ? lower : fallback;
}

export function signoutContinueProxyResponse(
  request: NextRequest,
  deps: { locale: string; peptideOsOrigin: string; appUrl?: string }
): NextResponse {
  const locale = localeFromContinuePath(request.nextUrl.pathname, deps.locale);
  const { headers: requestHeaders } = prepareSignoutContinueRequestHeaders(request);
  const localeUrl = request.nextUrl.clone();
  const path = request.nextUrl.pathname;
  if (!/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i.test(path)) {
    localeUrl.pathname = `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
  }

  const response = signoutContinueForwardResponse(request, requestHeaders, localeUrl);
  response.headers.set("X-Next-Locale", locale);
  response.headers.set("Content-Language", locale);
  applySignoutContinueSecurityHeaders(response, deps.peptideOsOrigin, deps.appUrl);
  clearSignoutContinueCookies(response);
  return response;
}
