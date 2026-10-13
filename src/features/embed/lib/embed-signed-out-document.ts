import { NextResponse } from "next/server";

import {
  EMBED_BACK_TO_DASHBOARD,
  EMBED_COOKIE_NAME,
  embedSignedOutSessionBootstrap,
  isEmbedQuery
} from "./embed-mode";
import { embedBootScript } from "./embed-boot-script";

import { applyFrameAncestorsHeader } from "@/shared/lib/frame-ancestors";
import { peptideOsOrigin, resolvePeptideOsLoginUrl, resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";

/** A top-level tab navigation. An iframe request uses `iframe`, not `document`. */
export function isTopLevelDocumentNavigation(secFetchDest: string | null | undefined): boolean {
  return secFetchDest === "document";
}

/**
 * Framed only when Sec-Fetch-Dest is iframe or frame.
 * Any other present value is not framed, even with ?embed=1 or the wc-embed cookie.
 * A missing header falls back to ?embed=1. The cookie is never a framed signal.
 */
export function isEmbedDocumentRequest(
  search: string,
  cookie: string | null | undefined,
  secFetchDest?: string | null
): boolean {
  void cookie;
  if (secFetchDest === "iframe" || secFetchDest === "frame") return true;
  if (secFetchDest != null && secFetchDest !== "") return false;
  return isEmbedQuery(search);
}

export function readEmbedDocumentCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (name === EMBED_COOKIE_NAME) return rest.join("=");
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmbedSignedOutDocumentOptions {
  /** False on /auth/signout*. That page posts no session and no logout message. */
  postSession?: boolean;
}

/**
 * Old browsers omit Sec-Fetch-Dest, so a top-level ?embed=1 on a gated route
 * receives this document. If this window is not framed, drop embed=1 and load
 * the same path again. The next request is the normal same-origin navigation.
 */
export function embedTopLevelEmbedQueryEscape(): string {
  return `(function(){
if(!window.parent||window.parent!==window){return;}
try{
var url=new URL(location.href);
if(url.searchParams.get("embed")!=="1"){return;}
url.searchParams.delete("embed");
var next=url.pathname+(url.search||"")+(url.hash||"");
if(!next||next.charAt(0)!=="/"){return;}
location.replace(next);
}catch(e){}
})();`;
}

/** Framed signed-out page. CSP frame-ancestors is the allowlist. X-Frame-Options is not set. */
export function embedSignedOutFallbackHtml(
  links: { loginHref: string; signupHref: string; dashboardHref: string },
  options?: EmbedSignedOutDocumentOptions
): string {
  const login = escapeHtml(links.loginHref);
  const signup = escapeHtml(links.signupHref);
  const dashboard = escapeHtml(links.dashboardHref);
  const session = options?.postSession === false ? "" : `<script>${embedSignedOutSessionBootstrap()}</script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signed out</title>
    <script>${embedTopLevelEmbedQueryEscape()}</script>
    <script>${embedBootScript()}</script>
    ${session}
  </head>
  <body>
    <main data-wc-embed-fallback="">
      <p><a href="${login}" rel="noopener noreferrer" target="_top">Log in</a>
      <a href="${signup}" rel="noopener noreferrer" target="_top">Sign up</a></p>
      <p><a href="${dashboard}" rel="noopener noreferrer" target="_top">${escapeHtml(EMBED_BACK_TO_DASHBOARD)}</a></p>
    </main>
  </body>
</html>`;
}

export function embedSignedOutDocumentResponse(
  explicitUrl?: string,
  appUrl?: string,
  options?: EmbedSignedOutDocumentOptions
): NextResponse {
  const origin = peptideOsOrigin(explicitUrl, appUrl);
  const html = embedSignedOutFallbackHtml(
    {
      loginHref: resolvePeptideOsLoginUrl(explicitUrl, appUrl),
      signupHref: resolvePeptideOsSignupUrl(explicitUrl, appUrl),
      dashboardHref: new URL("/dashboard", `${origin}/`).toString()
    },
    options
  );
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  applyFrameAncestorsHeader(headers);
  return new NextResponse(html, { status: 200, headers });
}
