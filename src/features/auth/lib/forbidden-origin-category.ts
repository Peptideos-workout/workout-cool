/**
 * Redacted diagnostics for a PeptideOS SSO `forbidden_origin` rejection.
 * Categories only. The raw Origin, Referer, and any other request secret never leave this module.
 */

/** Exact https origin that maps to the `www` category. */
const WWW_HTTPS_ORIGIN = "https://www.peptideos.us";

/**
 * Hosts of the PeptideOS browser origins (`peptideos.us`, `www.peptideos.us`).
 * `http://` of one of these, with no port, path, or userinfo, is the `http` category.
 */
const ALLOWED_PEPTIDEOS_HOSTS = ["peptideos.us", "www.peptideos.us"] as const;

const HTTP_ALLOWED_ORIGINS = new Set<string>(ALLOWED_PEPTIDEOS_HOSTS.map((host) => `http://${host}`));

const SEC_FETCH_SITE_TOKENS = ["same-origin", "same-site", "cross-site", "none"] as const;

const SEC_FETCH_SITE_ALLOWLIST = new Set<string>(SEC_FETCH_SITE_TOKENS);

/** A real method token. Anything else could smuggle a URL or secret into the log line. */
const SAFE_HTTP_METHOD = /^[A-Z]{1,10}$/;

export const FORBIDDEN_ORIGIN_CATEGORIES = ["missing", "null", "www", "http", "other_host"] as const;

export type ForbiddenOriginCategory = (typeof FORBIDDEN_ORIGIN_CATEGORIES)[number];

export type SecFetchSiteLogValue = (typeof SEC_FETCH_SITE_TOKENS)[number] | "other" | "missing";

export interface ForbiddenOriginSignals {
  origin: string | null | undefined;
  secFetchSite: string | null | undefined;
  referer: string | null | undefined;
  method: string | null | undefined;
}

export interface ForbiddenOriginLogRecord {
  origin_category: ForbiddenOriginCategory;
  sec_fetch_site: SecFetchSiteLogValue;
  has_referer: boolean;
  method: string;
}

export function forbiddenOriginCategory(origin: string | null | undefined): ForbiddenOriginCategory {
  if (origin === null || origin === undefined || origin === "") return "missing";
  if (origin === "null") return "null";
  if (origin === WWW_HTTPS_ORIGIN) return "www";
  if (HTTP_ALLOWED_ORIGINS.has(origin)) return "http";
  return "other_host";
}

export function classifySecFetchSite(value: string | null | undefined): SecFetchSiteLogValue {
  if (value === null || value === undefined || value === "") return "missing";
  if (SEC_FETCH_SITE_ALLOWLIST.has(value)) return value as (typeof SEC_FETCH_SITE_TOKENS)[number];
  return "other";
}

function safeHttpMethod(method: string | null | undefined): string {
  if (typeof method !== "string" || !SAFE_HTTP_METHOD.test(method)) return "other";
  return method;
}

/** The only object that may be logged. Callers pass raw headers in and get categories out. */
export function forbiddenOriginLogRecord(signals: ForbiddenOriginSignals): ForbiddenOriginLogRecord {
  return {
    origin_category: forbiddenOriginCategory(signals.origin),
    sec_fetch_site: classifySecFetchSite(signals.secFetchSite),
    has_referer: typeof signals.referer === "string" && signals.referer.length > 0,
    method: safeHttpMethod(signals.method)
  };
}

/** Server-side only. A logging failure must not change the 403. */
export function logForbiddenOrigin(signals: ForbiddenOriginSignals): void {
  try {
    console.warn("[sso] forbidden_origin", forbiddenOriginLogRecord(signals));
  } catch {
    /* Logging must never change SSO disposition. */
  }
}
