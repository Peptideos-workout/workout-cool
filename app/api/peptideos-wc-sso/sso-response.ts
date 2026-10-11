import { NextResponse } from "next/server";

import { prefersBrowserSsoErrorPage, ssoErrorHtml } from "./sso-error-page";

import type { NextRequest } from "next/server";

export function ssoJson(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function ssoClientError(
  request: NextRequest,
  body: Record<string, unknown>,
  status: number,
  tryAgainHref: string
): NextResponse {
  if (!prefersBrowserSsoErrorPage(request.headers.get("accept"))) {
    return ssoJson(body, status);
  }

  const error = typeof body.error === "string" ? body.error : "sso_internal_error";
  const locale = request.headers.get("accept-language")?.split(",")[0]?.split(";")[0] ?? "en";
  const response = new NextResponse(ssoErrorHtml({ locale, error, tryAgainHref }), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
  return response;
}
