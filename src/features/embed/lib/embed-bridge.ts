import { shouldShowEmbedAuthFallback } from "./embed-mode";

import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

export const EMBED_CHILD_MESSAGE = {
  height: "wc:height",
  navigate: "wc:navigate",
  session: "wc:session",
  signedOut: "wc:signed-out"
} as const;

export const EMBED_SESSION_STATE = {
  signedIn: "signed-in",
  signedOut: "signed-out"
} as const;

export const EMBED_LOGOUT_REASON = "logout" as const;

export const EMBED_PARENT_MESSAGE = {
  theme: "wc:theme"
} as const;

const MIN_REPORTED_HEIGHT = 200;
const MAX_REPORTED_HEIGHT = 20000;

const REPORTABLE_PREFIXES = [
  "/programs",
  "/statistics",
  "/tools",
  "/profile",
  "/about",
  "/legal",
  "/onboarding",
  "/leaderboard",
  "/premium"
] as const;

export interface EmbedSessionInput {
  embed: boolean;
  sessionResolved: boolean;
  hasSession: boolean;
  ssoError?: boolean;
  pathname?: string;
  explicitLogout?: boolean;
}

export type EmbedSessionState = (typeof EMBED_SESSION_STATE)[keyof typeof EMBED_SESSION_STATE];

export interface EmbedChildMessageMap {
  height: { type: typeof EMBED_CHILD_MESSAGE.height; height: number };
  navigate: { type: typeof EMBED_CHILD_MESSAGE.navigate; path: string };
  session: { type: typeof EMBED_CHILD_MESSAGE.session; state: EmbedSessionState };
  signedOut: { type: typeof EMBED_CHILD_MESSAGE.signedOut; reason: typeof EMBED_LOGOUT_REASON };
}

export type EmbedChildMessage = EmbedChildMessageMap[keyof EmbedChildMessageMap];

export interface EmbedMessagePort {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface ParentThemeEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

export interface EmbedBridgeHost {
  parentOrigin: string;
  isEmbed: () => boolean;
  isTopLevel: () => boolean;
  parent: EmbedMessagePort | null;
  readHeight: () => unknown;
  readPath: () => string;
  subscribeResize: (notify: () => void) => () => void;
  subscribePath: (notify: () => void) => () => void;
  requestFrame: (callback: () => void) => number;
  setTheme: (theme: "light" | "dark") => void;
  addMessageListener: (listener: (event: ParentThemeEvent) => void) => () => void;
}

export interface EmbedSignedOutRuntime {
  embed: boolean;
  topLevel: boolean;
  parent: EmbedMessagePort | null;
}

/** Origin string only. `*`, paths, and non-URLs are refused. */
export function exactOrigin(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("*")) return null;
  try {
    const url = new URL(trimmed);
    if (url.origin !== trimmed) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Finite heights become an integer from 200 to 20000.
 * NaN, negatives, and non-numeric values are dropped. 0 clamps up to 200.
 */
export function clampReportedHeight(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_REPORTED_HEIGHT) return MIN_REPORTED_HEIGHT;
  if (rounded > MAX_REPORTED_HEIGHT) return MAX_REPORTED_HEIGHT;
  return rounded;
}

export function reportableEmbedPath(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.includes("\\") || trimmed.includes("..") || trimmed.includes("//")) return null;

  const hashless = trimmed.split("#")[0] ?? "";
  const queryAt = hashless.indexOf("?");
  let pathname = queryAt === -1 ? hashless : hashless.slice(0, queryAt);
  const search = queryAt === -1 ? "" : hashless.slice(queryAt);
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  if (search.includes("://") || search.includes("..")) return null;
  if (!isSafePathname(pathname) || !isSafeSearch(search)) return null;

  const stripped = stripLocalePrefix(pathname);
  if (stripped !== "/" && !REPORTABLE_PREFIXES.some((prefix) => stripped === prefix || stripped.startsWith(`${prefix}/`))) {
    return null;
  }

  return `${pathname}${search}`;
}

export function isEmbedSignedOutPath(input: string): boolean {
  if (typeof input !== "string") return false;
  const pathname = input.trim().split("?")[0]?.split("#")[0] ?? "";
  const stripped = stripLocalePrefix(pathname);
  return stripped === "/auth/signout" || stripped.startsWith("/auth/signout/");
}

let explicitLogoutPath: string | null = null;

/** Page that started logout. Cleared once the user leaves it for a non-sign-out path. */
export function markExplicitEmbedLogout(pathname: string): void {
  explicitLogoutPath = pathname;
}

export function explicitEmbedLogoutOnPath(pathname: string): boolean {
  return explicitLogoutPath !== null && explicitLogoutPath === pathname;
}

export function releaseExplicitEmbedLogout(pathname: string): void {
  if (explicitLogoutPath === null || explicitLogoutPath === pathname) return;
  if (isEmbedSignedOutPath(pathname)) return;
  explicitLogoutPath = null;
}

export function clearExplicitEmbedLogout(): void {
  explicitLogoutPath = null;
}

export function postToParent(parent: EmbedMessagePort | null, origin: string, message: EmbedChildMessage): boolean {
  const targetOrigin = exactOrigin(origin);
  if (!parent || !targetOrigin) return false;
  parent.postMessage(message, targetOrigin);
  return true;
}

export function acceptParentThemeMessage(event: ParentThemeEvent, parent: unknown, peptideOrigin: string): "light" | "dark" | null {
  const expected = exactOrigin(peptideOrigin);
  if (!expected || event.origin !== expected || event.source !== parent) return null;
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return null;

  const record = event.data as Record<string, unknown>;
  const keys = Object.keys(record);
  const hasType = Object.prototype.hasOwnProperty.call(record, "type");
  const hasTheme = Object.prototype.hasOwnProperty.call(record, "theme");
  if (keys.length !== 2 || !hasType || !hasTheme) return null;
  if (record.type !== EMBED_PARENT_MESSAGE.theme) return null;
  if (record.theme !== "light" && record.theme !== "dark") return null;
  return record.theme;
}

export interface HeightReporter {
  report: (value: unknown) => void;
  stop: () => void;
}

export function createHeightReporter(post: (height: number) => void, requestFrame: (callback: () => void) => number): HeightReporter {
  let queued: number | null = null;
  let pending = false;
  let alive = true;

  return {
    report(value: unknown) {
      if (!alive) return;
      const height = clampReportedHeight(value);
      if (height === null) return;
      queued = height;
      if (pending) return;
      pending = true;
      requestFrame(() => {
        pending = false;
        if (!alive || queued === null) return;
        const heightToSend = queued;
        queued = null;
        post(heightToSend);
      });
    },
    stop() {
      alive = false;
      queued = null;
      pending = false;
    }
  };
}

/** Posts height, path, and accepts theme. Inbound messages cannot sign in or out. */
export function startEmbedBridge(host: EmbedBridgeHost): () => void {
  if (!host.isEmbed() || host.isTopLevel()) return () => undefined;
  const origin = exactOrigin(host.parentOrigin);
  if (!origin || !host.parent) return () => undefined;

  const parent = host.parent;
  let stopped = false;
  const reporter = createHeightReporter((height) => {
    if (stopped) return;
    postToParent(parent, origin, { type: EMBED_CHILD_MESSAGE.height, height });
  }, host.requestFrame);

  const publishPath = () => {
    if (stopped) return;
    const raw = host.readPath();
    if (isEmbedSignedOutPath(raw)) {
      postToParent(parent, origin, embedLogoutMessage());
      return;
    }
    const path = reportableEmbedPath(raw);
    if (!path) return;
    postToParent(parent, origin, { type: EMBED_CHILD_MESSAGE.navigate, path });
  };

  const stopResize = host.subscribeResize(() => {
    if (!stopped) reporter.report(host.readHeight());
  });
  const stopPath = host.subscribePath(publishPath);
  const stopMessages = host.addMessageListener((event) => {
    const theme = acceptParentThemeMessage(event, parent, origin);
    if (!theme || stopped) return;
    host.setTheme(theme);
  });

  reporter.report(host.readHeight());
  publishPath();

  return () => {
    stopped = true;
    reporter.stop();
    stopResize();
    stopPath();
    stopMessages();
  };
}

export function embedSessionMessage(state: EmbedSessionState): EmbedChildMessageMap["session"] {
  return { type: EMBED_CHILD_MESSAGE.session, state };
}

export function embedLogoutMessage(): EmbedChildMessageMap["signedOut"] {
  return { type: EMBED_CHILD_MESSAGE.signedOut, reason: EMBED_LOGOUT_REASON };
}

/**
 * Null until the session is known. Signed-out matches the Log in / Sign up fallback.
 * A sign-out path, or the page that started logout, does not also send signed-out.
 * That page's only auth signal is wc:signed-out.
 */
export function embedReportedSession(input: EmbedSessionInput): EmbedSessionState | null {
  if (!input.embed) return null;
  const onSignOutPath = input.pathname ? isEmbedSignedOutPath(input.pathname) : false;
  if (shouldShowEmbedAuthFallback(input)) {
    if (onSignOutPath || input.explicitLogout) return null;
    return EMBED_SESSION_STATE.signedOut;
  }
  if (!input.sessionResolved) return null;
  if (input.hasSession) return EMBED_SESSION_STATE.signedIn;
  return null;
}

/** The next session post, or null when the state is still unknown or unchanged. */
export function sessionReportToSend(
  previous: EmbedSessionState | null,
  next: EmbedSessionState | null
): EmbedSessionState | null {
  if (next === null || next === previous) return null;
  return next;
}

export function postEmbedSession(
  origin: string,
  state: EmbedSessionState | null,
  runtime: EmbedSignedOutRuntime = readBrowserEmbedRuntime()
): boolean {
  if (!state || !runtime.embed || runtime.topLevel) return false;
  return postToParent(runtime.parent, origin, embedSessionMessage(state));
}

function isSafePathname(pathname: string): boolean {
  if (pathname === "/") return true;
  return /^\/(?:[A-Za-z0-9._~%-]+\/)*[A-Za-z0-9._~%-]+$/.test(pathname);
}

function isSafeSearch(search: string): boolean {
  if (!search) return true;
  return /^\?[A-Za-z0-9._~%=&+-]*$/.test(search);
}

function readBrowserEmbedRuntime(): EmbedSignedOutRuntime {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { embed: false, topLevel: true, parent: null };
  }
  return {
    embed: document.documentElement.getAttribute("data-wc-embed") === "1",
    topLevel: window.parent === window,
    parent: window.parent
  };
}
