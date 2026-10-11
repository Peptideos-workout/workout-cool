import { setSessionCookie } from "better-auth/cookies";

import { serializeBetterAuthSignedCookie } from "./signed-cookie";

import { auth } from "@/features/auth/lib/better-auth";

interface SessionCookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string | boolean;
}

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

/**
 * Create a Better Auth session and set it with Better Auth's signed cookie helper.
 */
export async function createTrustedBetterAuthSession(userId: string): Promise<Response | null> {
  try {
    const authCtx = await auth.$context;
    const user = await authCtx.internalAdapter.findUserById(userId);
    if (!user) return null;

    const responseHeaders = new Headers();
    const endpointCtx = {
      context: authCtx,
      headers: new Headers(),
      setCookie(name: string, value: string, options?: SessionCookieOptions) {
        responseHeaders.append("set-cookie", serializeUnsignedCookie(name, value, options));
        return "";
      },
      async setSignedCookie(name: string, value: string, secret: string, options?: SessionCookieOptions) {
        const cookie = await serializeBetterAuthSignedCookie(name, value, secret, options);
        responseHeaders.append("set-cookie", cookie);
        return cookie;
      },
      async getSignedCookie() {
        return null;
      }
    };

    const session = await authCtx.internalAdapter.createSession(userId, endpointCtx as never);
    if (!session) return null;

    await setSessionCookie(endpointCtx as never, { session, user });
    return new Response(null, { status: 200, headers: responseHeaders });
  } catch {
    return null;
  }
}
