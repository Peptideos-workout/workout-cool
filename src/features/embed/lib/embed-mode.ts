import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

/** sessionStorage key. Tab-scoped, so a normal tab never inherits embed mode. */
export const EMBED_SESSION_KEY = "wc-embed";

export const EMBED_HTML_ATTR = "data-wc-embed";

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
 * While embedded, sign-out breaks out of the frame and every other
 * cross-origin navigation opens a new tab. Same-origin links stay put.
 * Outside embed mode the caller must not set a target.
 */
export function embedFrameTarget(
  embed: boolean,
  href: string,
  pageOrigin: string,
  peptideOrigin = "https://peptideos.us"
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

  if (matchesPrefix(url.pathname, SIGNOUT_PREFIXES)) {
    return "_top";
  }

  let parentOrigin = peptideOrigin;
  try {
    parentOrigin = new URL(peptideOrigin).origin;
  } catch {
    parentOrigin = peptideOrigin;
  }

  if (url.origin === parentOrigin && matchesPrefix(url.pathname, AUTH_BREAKOUT_PREFIXES)) {
    return "_top";
  }

  if (isPaymentCheckoutHost(url.hostname)) {
    return "_top";
  }

  if (url.origin === pageOrigin) {
    return null;
  }

  return "_blank";
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
