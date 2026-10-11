import crypto from "crypto";

import { prisma } from "@/shared/lib/prisma";
import { auth } from "@/features/auth/lib/better-auth";

interface SessionCookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

function serializeCookie(name: string, value: string, options: SessionCookieOptions): string {
  const parts = [`${name}=${value}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

/**
 * Create a Better Auth session without changing the user's password.
 * Used only after PeptideOS identity is already verified.
 */
export async function createTrustedBetterAuthSession(userId: string): Promise<Response | null> {
  try {
    const authCtx = await auth.$context;
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + authCtx.sessionConfig.expiresIn * 1000);

    await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        token,
        userId,
        expiresAt,
        createdAt: now,
        updatedAt: now
      }
    });

    const cookie = authCtx.authCookies.sessionToken;
    const response = new Response(null, { status: 200 });
    response.headers.append("set-cookie", serializeCookie(cookie.name, token, cookie.options));
    return response;
  } catch {
    return null;
  }
}
