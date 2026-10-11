import { setSessionCookie } from "better-auth/cookies";

import { attachTrustedSession } from "./attach-trusted-session";

import type { AttachTrustedSessionResult } from "./attach-trusted-session";

import { auth } from "@/features/auth/lib/better-auth";

/**
 * Create a Better Auth session and set it with Better Auth's signed cookie helper.
 */
export async function createTrustedBetterAuthSession(userId: string): Promise<AttachTrustedSessionResult> {
  try {
    const authCtx = await auth.$context;
    return attachTrustedSession(userId, {
      authContext: authCtx,
      findUserById: (id) => authCtx.internalAdapter.findUserById(id),
      createSession: (id, ctx) => authCtx.internalAdapter.createSession(id, ctx as never),
      deleteSession: (token) => authCtx.internalAdapter.deleteSession(token),
      setSessionCookie: (ctx, data) => setSessionCookie(ctx as never, data as never)
    });
  } catch {
    return { ok: false, wroteSession: false, response: null };
  }
}
