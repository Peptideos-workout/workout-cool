import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

/** sessionStorage key. Tab-scoped, so a normal tab never inherits embed mode. */
export const EMBED_SESSION_KEY = "wc-embed";

/** Same name as the session flag, so the proxy can see an embed navigation. */
export const EMBED_COOKIE_NAME = EMBED_SESSION_KEY;

export const EMBED_HTML_ATTR = "data-wc-embed";

/**
 * Exact parent origins. These are the frame-ancestors allowlist without `'self'`.
 * `'self'` is this app, not a parent we post to.
 */
export const EMBED_PARENT_ORIGINS = ["https://peptideos.us", "https://www.peptideos.us"] as const;

export const EMBED_PARENT_ORIGIN_DEFAULT = EMBED_PARENT_ORIGINS[0];

/** Frameable page used when /auth/signout* would be refused inside the iframe. */
export const EMBED_FRAMEABLE_LOGOUT_PATH = "/?embed=1";

const SIGNOUT_PREFIXES = ["/auth/signout", "/api/workouts/signout"] as const;
const AUTH_BREAKOUT_PREFIXES = ["/login", "/signup", "/api/workouts/sso", "/dashboard"] as const;
const PAYMENT_HOSTS = ["stripe.com", "paypal.com", "lemonsqueezy.com"] as const;

/** Exact label for every embed control that returns to PeptideOS. */
export const EMBED_BACK_TO_DASHBOARD = "← Back to dashboard";

export const SSO_FAILURE_CODES = [
  "forbidden_origin",
  "sso_internal_error",
  "invalid_or_expired_handoff",
  "sso_signin_failed",
  "sso_email_collision",
  "missing_token",
  "missing_email",
  "empty_body",
  "payload_too_large",
  "unsupported_media_type",
  "auth_users_lookup_failed"
] as const;

export function isSsoFailureCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return (SSO_FAILURE_CODES as readonly string[]).includes(code);
}

/**
 * Header chrome stays hidden. Log in / Sign up come back only when the embed
 * has no session, or the handoff ended in an SSO error such as forbidden_origin.
 */
export function shouldShowEmbedAuthFallback(input: {
  embed: boolean;
  sessionResolved: boolean;
  hasSession: boolean;
  ssoError?: boolean;
}): boolean {
  if (!input.embed) return false;
  if (input.ssoError) return true;
  if (!input.sessionResolved) return false;
  return !input.hasSession;
}

export function isEmbedSsoSignal(input: { search?: string; referer?: string | null; embedField?: string | null }): boolean {
  if (input.embedField === "1") return true;
  const raw = input.search ?? "";
  const search = raw.startsWith("?") ? raw.slice(1) : raw;
  if (new URLSearchParams(search).get("embed") === "1") return true;
  if (!input.referer) return false;
  try {
    return new URL(input.referer).searchParams.get("embed") === "1";
  } catch {
    return false;
  }
}

export function resolveEmbedEnabled(search: string, sessionValue: string | null): boolean {
  return isEmbedQuery(search) || sessionValue === "1";
}

export function isEmbedQuery(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("embed") === "1";
}

export function isEmbedParentOrigin(origin: string): boolean {
  return (EMBED_PARENT_ORIGINS as readonly string[]).includes(origin);
}

/**
 * Parent postMessage origin. ancestorOrigins, then referrer, and only when the
 * value is exactly one of the frame-ancestors origins. Otherwise the apex.
 */
export function resolveEmbedParentOrigin(input: {
  referrer?: string | null;
  ancestorOrigins?: ArrayLike<string> | null;
}): string {
  const ancestors = input.ancestorOrigins;
  if (ancestors) {
    for (let index = 0; index < ancestors.length; index += 1) {
      const origin = ancestors[index];
      if (typeof origin === "string" && isEmbedParentOrigin(origin)) return origin;
    }
  }
  if (input.referrer) {
    try {
      const origin = new URL(input.referrer).origin;
      if (isEmbedParentOrigin(origin)) return origin;
    } catch {
      // Ignore an unparseable referrer and use the apex.
    }
  }
  return EMBED_PARENT_ORIGIN_DEFAULT;
}

export interface EmbedLogoutRuntime {
  embed: boolean;
  topLevel: boolean;
  parent: { postMessage: (message: unknown, origin: string) => void } | null;
  referrer?: string | null;
  ancestorOrigins?: ArrayLike<string> | null;
}

/** wc:signed-out before the server action. No-ops outside a real frame. Never uses '*'. */
export function postEmbedLogoutToParent(runtime: EmbedLogoutRuntime = readEmbedLogoutRuntime()): boolean {
  if (!runtime.embed || runtime.topLevel || !runtime.parent) return false;
  const origin = resolveEmbedParentOrigin(runtime);
  if (!isEmbedParentOrigin(origin)) return false;
  runtime.parent.postMessage({ type: "wc:signed-out", reason: "logout" }, origin);
  return true;
}

/** Inline script for a framed signed-out document that has no React bridge. */
export function embedSignedOutSessionBootstrap(): string {
  const allowed = JSON.stringify([...EMBED_PARENT_ORIGINS]);
  const apex = JSON.stringify(EMBED_PARENT_ORIGIN_DEFAULT);
  return `(function(){
var allowed=${allowed};
var target=${apex};
try{
var matched=false;
var ancestors=location.ancestorOrigins;
if(ancestors){
for(var i=0;i<ancestors.length;i++){
if(allowed.indexOf(ancestors[i])!==-1){target=ancestors[i];matched=true;break;}
}
}
if(!matched&&document.referrer){
var ref=new URL(document.referrer).origin;
if(allowed.indexOf(ref)!==-1){target=ref;}
}
}catch(e){}
if(!window.parent||window.parent===window){return;}
window.parent.postMessage({type:"wc:session",state:"signed-out"},target);
})();`;
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const path = stripLocalePrefix(pathname);
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isPaymentCheckoutHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PAYMENT_HOSTS.some((paymentHost) => host === paymentHost || host.endsWith(`.${paymentHost}`));
}

/**
 * In embed mode, only https payment-provider hosts leave via the top window.
 * Same-origin checkout stays in the pane. Every other cross-origin URL is refused.
 * Outside embed mode the caller navigates the current window.
 */
export function checkoutBreakoutTarget(embed: boolean, href: string, pageOrigin: string): "_top" | "self" | "refuse" {
  if (!embed) return "self";
  try {
    const url = new URL(href, pageOrigin);
    if (url.origin === pageOrigin) return "self";
    if (url.protocol === "https:" && isPaymentCheckoutHost(url.hostname)) return "_top";
    return "refuse";
  } catch {
    return "refuse";
  }
}

export interface CheckoutAssignRuntime {
  embed: boolean;
  pageOrigin: string;
  assignSelf: (href: string) => void;
  assignTop: (href: string) => void;
}

const REFUSED_CHECKOUT_LOG = "Refused embed checkout navigation to a non-payment host";

/** Programmatic Stripe and billing navigations. Links still use embedFrameTarget. */
export function assignCheckoutUrl(href: string, runtime: CheckoutAssignRuntime = browserCheckoutRuntime()): void {
  const target = checkoutBreakoutTarget(runtime.embed, href, runtime.pageOrigin);
  if (target === "_top") {
    runtime.assignTop(href);
    return;
  }
  if (target === "refuse") {
    console.error(REFUSED_CHECKOUT_LOG);
    return;
  }
  runtime.assignSelf(href);
}

/**
 * While embedded, sign-out never breaks out of the frame. PeptideOS logout is
 * the parent's job. https payment hosts still leave via the top window.
 * An http payment host is an ordinary cross-origin link. Same-origin links stay put.
 * Outside embed mode the caller must not set a target.
 * `peptideOrigin` cannot widen the frame-ancestors allowlist.
 */
export function embedFrameTarget(
  embed: boolean,
  href: string,
  pageOrigin: string,
  peptideOrigin = EMBED_PARENT_ORIGIN_DEFAULT
): "_top" | "_blank" | null {
  if (!embed) return null;
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw) || /^data:/i.test(raw)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw, pageOrigin);
  } catch {
    return "_blank";
  }

  if (isBlockedEmbedSignoutUrl(url, pageOrigin)) return null;
  if (isTrustedParentOrigin(url.origin, peptideOrigin) && matchesPrefix(url.pathname, AUTH_BREAKOUT_PREFIXES)) {
    return "_top";
  }
  if (url.protocol === "https:" && isPaymentCheckoutHost(url.hostname)) return "_top";
  if (url.origin === pageOrigin) return null;
  return "_blank";
}

/** Same-origin sign-out and PeptideOS sign-out must not navigate the top window. */
export function isBlockedEmbedSignoutUrl(url: URL, pageOrigin: string): boolean {
  if (!matchesPrefix(url.pathname, SIGNOUT_PREFIXES)) return false;
  return url.origin === pageOrigin || isEmbedParentOrigin(url.origin);
}

export function isEmbedUnframeableSignoutPath(pathname: string): boolean {
  return matchesPrefix(pathname, ["/auth/signout"]);
}

function isTrustedParentOrigin(origin: string, peptideOrigin: string): boolean {
  if (isEmbedParentOrigin(origin)) return true;
  try {
    const requested = new URL(peptideOrigin).origin;
    return requested === origin && isEmbedParentOrigin(requested);
  } catch {
    return false;
  }
}

function readEmbedLogoutRuntime(): EmbedLogoutRuntime {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { embed: false, topLevel: true, parent: null };
  }
  const location = window.location as Location & { ancestorOrigins?: ArrayLike<string> };
  return {
    embed: document.documentElement.getAttribute(EMBED_HTML_ATTR) === "1",
    topLevel: window.parent === window,
    parent: window.parent,
    referrer: document.referrer,
    ancestorOrigins: location.ancestorOrigins ?? null
  };
}

function browserCheckoutRuntime(): CheckoutAssignRuntime {
  const embed = typeof document !== "undefined" && document.documentElement.getAttribute(EMBED_HTML_ATTR) === "1";
  const pageOrigin = typeof window !== "undefined" ? window.location.origin : "https://workouts.peptideos.us";
  return {
    embed,
    pageOrigin,
    assignSelf: (href) => window.location.assign(href),
    assignTop: (href) => {
      const top = window.top ?? window;
      top.location.assign(href);
    }
  };
}
