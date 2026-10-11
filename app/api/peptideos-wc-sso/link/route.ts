import crypto from "crypto";

import { NextResponse } from "next/server";
import { AccountsLinkedEmail } from "@emails/AccountsLinkedEmail";

import { configuredWorkoutOrigin } from "../workout-origin";
import { createTrustedBetterAuthSession } from "../trusted-session";
import { ssoJson } from "../sso-response";
import { CREDENTIAL_PROVIDER, PEPTIDEOS_PROVIDER } from "../resolve-sso-account";
import { defaultLinkAttemptLimiter } from "../link-rate-limit";
import { isEmailInfraConfigured, sendAccountsLinkedEmail } from "../link-email";
import { isTrustedMutationOrigin } from "../link-csrf";
import { expireLinkCookie, LINK_COOKIE_NAME } from "../link-cookie";
import { defaultLinkJtiStore, insertPeptideosAccountLink, linkPeptideosAccount, PEPTIDEOS_LINK_GENERIC_ERROR } from "../link-account";

import type { NextRequest } from "next/server";

import { prisma } from "@/shared/lib/prisma";
import { sendEmail } from "@/shared/lib/mail/sendEmail";
import { hashStringWithSalt } from "@/features/update-password/lib/hash";
import { betterAuthTrustedOrigins } from "@/features/auth/lib/trusted-origins";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

export const dynamic = "force-dynamic";

function mergeSetCookies(from: Response, to: NextResponse) {
  const h = from.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : null;
  if (list && list.length) {
    list.forEach((c) => to.headers.append("set-cookie", c));
    return;
  }
  const one = from.headers.get("set-cookie");
  if (one) to.headers.append("set-cookie", one);
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

function auditPeptideosLink(entry: { wcUserId: string; peptideosUserId: string }) {
  console.info("[peptideos-link] accounts_linked", {
    wcUserId: entry.wcUserId,
    peptideosUserId: entry.peptideosUserId
  });
}

async function verifyPasswordWithBetterAuth(email: string, password: string): Promise<{ userId: string } | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return null;

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
    select: { password: true }
  });
  if (!account?.password) return null;

  try {
    const ctx = await auth.$context;
    const verify = ctx.password?.verify;
    const valid = verify
      ? await verify({ password, hash: account.password })
      : hashStringWithSalt(password, env.BETTER_AUTH_SECRET) === account.password;
    return valid ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const trusted = betterAuthTrustedOrigins(env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL);
  if (!isTrustedMutationOrigin(request.headers.get("origin"), trusted)) {
    return ssoJson({ error: PEPTIDEOS_LINK_GENERIC_ERROR }, 400);
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return ssoJson({ error: PEPTIDEOS_LINK_GENERIC_ERROR }, 400);
  }

  const cookieValue = request.cookies.get(LINK_COOKIE_NAME)?.value ?? "";
  const origin = configuredWorkoutOrigin(env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL);
  const sessionHolder: { response: Response | null } = { response: null };

  const result = await linkPeptideosAccount(
    { cookieValue, password, ip: clientIp(request) },
    {
      now: Date.now,
      secret: env.BETTER_AUTH_SECRET,
      isJtiConsumed: (jti) => defaultLinkJtiStore.isConsumed(jti),
      consumeJti: (jti) => defaultLinkJtiStore.consume(jti),
      isRateLimited: (userId, ip) => defaultLinkAttemptLimiter.isLimited(userId, ip),
      recordFailure: (userId, ip) => defaultLinkAttemptLimiter.recordFailure(userId, ip),
      findUserById: async (id) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true } }),
      verifyPassword: verifyPasswordWithBetterAuth,
      linkAccount: async ({ wcUserId, peptideosUserId }) =>
        prisma.$transaction((tx) =>
          insertPeptideosAccountLink(
            {
              create: async (row) => {
                await tx.account.create({ data: row });
              },
              findExisting: async () =>
                tx.account.findUnique({
                  where: { providerId_accountId: { providerId: PEPTIDEOS_PROVIDER, accountId: peptideosUserId } },
                  select: { userId: true }
                })
            },
            {
              wcUserId,
              peptideosUserId,
              newId: crypto.randomUUID(),
              now: () => new Date()
            },
          ),
        ),
      createSignedSession: async (userId) => {
        const signedIn = await createTrustedBetterAuthSession(userId);
        if (signedIn.ok) {
          sessionHolder.response = signedIn.response;
          return true;
        }
        return false;
      },
      auditLog: auditPeptideosLink,
      sendLinkedEmail: async (email) => {
        await sendAccountsLinkedEmail({
          to: email,
          isConfigured: isEmailInfraConfigured(env),
          send: async (payload) =>
            sendEmail({
              to: payload.to,
              subject: payload.subject,
              text: payload.text,
              react: AccountsLinkedEmail()
            })
        });
      }
    },
  );

  if (!result.ok) {
    const response = ssoJson({ error: result.error }, result.status);
    return response;
  }

  if (!sessionHolder.response) {
    return ssoJson({ error: PEPTIDEOS_LINK_GENERIC_ERROR }, 500);
  }

  const redirect = NextResponse.json({ ok: true, redirectTo: `${origin}/` }, { status: 200 });
  mergeSetCookies(sessionHolder.response, redirect);
  redirect.headers.append("set-cookie", expireLinkCookie());
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}
