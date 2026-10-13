import { NextResponse } from "next/server";

import { prefersBrowserSsoErrorPage, ssoErrorHtml } from "./sso-error-page";

import type { NextRequest } from "next/server";

import { applyFrameAncestorsHeader } from "@/shared/lib/frame-ancestors";

const SAFE_SSO_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;

/** Client bodies are a stable error code only. Never dev_detail, messages, emails, or tokens. */
export function safeSsoErrorBody(body: Record<string, unknown>): { error: string } {
  const code = typeof body.error === "string" && SAFE_SSO_ERROR_CODE.test(body.error) ? body.error : "sso_internal_error";
  return { error: code };
}

/** Every SSO response, success or error, must be uncacheable and must not leak the handoff URL. */
export function applySsoResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  applyFrameAncestorsHeader(response.headers);
  return response;
}

export function ssoJson(body: Record<string, unknown>, status: number): NextResponse {
  return applySsoResponseHeaders(NextResponse.json(body, { status }));
}

export function ssoClientError(
  request: NextRequest,
  body: Record<string, unknown>,
  status: number,
  tryAgainHref: string
): NextResponse {
  const safeBody = safeSsoErrorBody(body);
  if (!prefersBrowserSsoErrorPage(request.headers.get("accept"))) {
    return ssoJson(safeBody, status);
  }

  const error = safeBody.error;
  const locale = request.headers.get("accept-language")?.split(",")[0]?.split(";")[0] ?? "en";
  const response = new NextResponse(ssoErrorHtml({ locale, error, tryAgainHref }), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
  return applySsoResponseHeaders(response);
}
