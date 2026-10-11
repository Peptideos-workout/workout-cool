import { logSsoEvent } from "./sso-error-log";
import { serializeBetterAuthSignedCookie } from "./signed-cookie";

interface SessionCookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string | boolean;
}

export interface TrustedSessionCookieCtx {
  context?: unknown;
  headers: Headers;
  setCookie: (name: string, value: string, options?: SessionCookieOptions) => string;
  setSignedCookie: (name: string, value: string, secret: string, options?: SessionCookieOptions) => Promise<string>;
  getSignedCookie: () => Promise<string | null>;
}

export interface AttachTrustedSessionDeps {
  findUserById: (userId: string) => Promise<{ id: string } | null>;
  createSession: (userId: string, ctx: TrustedSessionCookieCtx) => Promise<{ id: string; token: string } | null>;
  deleteSession: (token: string) => Promise<void>;
  setSessionCookie: (
    ctx: TrustedSessionCookieCtx,
    data: { session: { id: string; token: string }; user: { id: string } },
  ) => Promise<void>;
  authContext?: unknown;
}

export type AttachTrustedSessionResult =
  | { ok: true; wroteSession: true; response: Response }
  | { ok: false; wroteSession: boolean; response: null };

function serializeUnsignedCookie(name: string, value: string, options: SessionCookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = typeof options.sameSite === "string" ? options.sameSite : "Lax";
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }
  return parts.join("; ");
}

async function deleteCreatedSession(deleteSession: AttachTrustedSessionDeps["deleteSession"], token: string) {
  try {
    await deleteSession(token);
  } catch {
    /* Session write already happened; callers must not release the handoff. */
  }
}

/**
 * createSession is a write. If the cookie cannot be set afterwards, delete the orphan
 * when possible and still report wroteSession so the handoff is never released.
 */
export async function attachTrustedSession(
  userId: string,
  deps: AttachTrustedSessionDeps,
): Promise<AttachTrustedSessionResult> {
  let wroteSession = false;
  try {
    const user = await deps.findUserById(userId);
    if (!user) return { ok: false, wroteSession: false, response: null };

    const responseHeaders = new Headers();
    const ctx: TrustedSessionCookieCtx = {
      context: deps.authContext,
      headers: new Headers(),
      setCookie(name, value, options = {}) {
        responseHeaders.append("set-cookie", serializeUnsignedCookie(name, value, options));
        return "";
      },
      async setSignedCookie(name, value, secret, options = {}) {
        const cookie = await serializeBetterAuthSignedCookie(name, value, secret, options);
        responseHeaders.append("set-cookie", cookie);
        return cookie;
      },
      async getSignedCookie() {
        return null;
      }
    };

    let session: { id: string; token: string } | null = null;
    try {
      session = await deps.createSession(userId, ctx);
    } catch (error) {
      // Better Auth can persist the row then throw in a hook. Unknown = a write; never release.
      wroteSession = true;
      logSsoEvent("createSession", error);
      return { ok: false, wroteSession: true, response: null };
    }
    if (!session?.token) return { ok: false, wroteSession: false, response: null };
    wroteSession = true;

    try {
      await deps.setSessionCookie(ctx, { session, user });
      if (!responseHeaders.get("set-cookie")) {
        await deleteCreatedSession(deps.deleteSession, session.token);
        return { ok: false, wroteSession: true, response: null };
      }
      return { ok: true, wroteSession: true, response: new Response(null, { status: 200, headers: responseHeaders }) };
    } catch (error) {
      logSsoEvent("setSessionCookie", error);
      await deleteCreatedSession(deps.deleteSession, session.token);
      return { ok: false, wroteSession: true, response: null };
    }
  } catch {
    return { ok: false, wroteSession, response: null };
  }
}
