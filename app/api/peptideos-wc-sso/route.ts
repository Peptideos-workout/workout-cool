/**
 * PeptideOS → Workout.cool SSO
 *
 * Routed **outside** `/api/auth/` so Better Auth’s `app/api/auth/[...all]/route.ts`
 * cannot intercept this path (production often 404 otherwise).
 *
 * PeptideOS PR #22 stores `secret_token` as sha256(rawToken) hex — never compare plaintext.
 * New SSO users get a random unused password; sign-in is a Better Auth signed session.
 */
import crypto from "crypto";

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { configuredWorkoutOrigin } from "./workout-origin";
import { newUnusedSsoPassword } from "./unused-sso-password";
import { createTrustedBetterAuthSession } from "./trusted-session";
import { ssoJson } from "./sso-response";
import { PEPTIDEOS_PROVIDER } from "./resolve-sso-account";
import { handoffDisposition } from "./handoff-disposition";
import { lookupUnconsumedHandoffByHash, releaseHandoffClaimByHash, runWithHandoffClaim } from "./consume-handoff";
import { completePeptideOsSsoLogin } from "./complete-sso";

import type { NextRequest } from "next/server";
import type { SsoAccountSnapshot } from "./resolve-sso-account";

import { prisma } from "@/shared/lib/prisma";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

function workoutOrigin(): string {
  return configuredWorkoutOrigin(env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL);
}

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

function splitName(displayName: string | undefined, email: string): { firstName: string; lastName: string; name: string } {
  const d = displayName?.trim();
  if (d) {
    const p = d.split(/\s+/).filter(Boolean);
    const firstName = p[0] ?? "Athlete";
    const lastName = p.slice(1).join(" ") || "Athlete";
    return { firstName, lastName, name: d };
  }
  const local = (email.split("@")[0] || "Athlete").slice(0, 48);
  return { firstName: local || "Athlete", lastName: "User", name: `${local} User` };
}

function finalizeSession(signInRes: Response): NextResponse {
  const home = `${workoutOrigin()}/`;
  const redirect = NextResponse.redirect(home);
  mergeSetCookies(signInRes, redirect);
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

function ssoExplain(e: unknown): { dev_detail?: string } {
  const allow =
    process.env.NODE_ENV === "development" || process.env.SSO_DIAGNOSTICS === "1" || process.env.SSO_DIAGNOSTICS === "true";
  if (!allow) return {};
  let msg =
    e instanceof Error
      ? e.message || String(e)
      : typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code.trim()
      : "";
  msg = `${code ? `${code} — ` : ""}${msg}`;
  msg = msg.slice(0, 800);
  return msg ? { dev_detail: msg } : {};
}

function metaDisplayName(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  const full =
    typeof m.full_name === "string"
      ? m.full_name.trim()
      : typeof m.name === "string"
        ? m.name.trim()
        : "";
  return full || undefined;
}

async function loadSsoAccountSnapshot(email: string): Promise<SsoAccountSnapshot> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { select: { providerId: true, accountId: true } } }
  });

  if (!existingUser) {
    return { existingUser: null, peptideosAccountId: null };
  }

  const peptideosAccount = existingUser.accounts.find((account) => account.providerId === PEPTIDEOS_PROVIDER);
  return {
    existingUser: { id: existingUser.id },
    peptideosAccountId: peptideosAccount?.accountId ?? null
  };
}

async function createPeptideosAccount(userId: string, peptideosUserId: string) {
  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: peptideosUserId,
      providerId: PEPTIDEOS_PROVIDER,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tokenParam = request.nextUrl.searchParams.get("token")?.trim();
  if (!tokenParam) return ssoJson({ error: "missing_token" }, 400);

  try {
    const claimed = await runWithHandoffClaim(
      tokenParam,
      {
        claimByHash: (tokenHash) => lookupUnconsumedHandoffByHash(prisma, tokenHash),
        releaseByHash: (tokenHash, claimedAt) => releaseHandoffClaimByHash(prisma, tokenHash, claimedAt)
      },
      async (hid) => {
        const signInHolder: { response: Response | null } = { response: null };

        let userRows: { email: string; meta: unknown }[];
        try {
          userRows = await prisma.$queryRaw<{ email: string; meta: unknown }[]>`
      SELECT email, raw_user_meta_data AS meta
      FROM auth.users
      WHERE id::text = ${hid}
      LIMIT 1
    `;
        } catch (e) {
          console.error("[peptideos-wc-sso] auth.users lookup:", e);
          return {
            value: ssoJson({ error: "auth_users_lookup_failed", ...ssoExplain(e) }, 500),
            disposition: "release" as const
          };
        }

        const email = userRows[0]?.email?.trim().toLowerCase();
        if (!email) {
          return { value: ssoJson({ error: "missing_email" }, 500), disposition: "release" as const };
        }

        const displayName = metaDisplayName(userRows[0]?.meta);
        const snapshot = await loadSsoAccountSnapshot(email);

        const completed = await completePeptideOsSsoLogin(hid, snapshot, {
          findUserByEmail: async () => prisma.user.findUnique({ where: { email }, select: { id: true } }),
          signUp: async () => {
            const { firstName, lastName, name } = splitName(displayName, email);
            const unusedPassword = newUnusedSsoPassword();
            const created = await auth.api.signUpEmail({
              body: {
                email,
                password: unusedPassword,
                name,
                firstName,
                lastName,
                role: UserRole.user
              },
              headers: request.headers
            });
            const userId = created?.user?.id;
            return userId ? { userId } : null;
          },
          createPeptideosAccount: async (userId) => {
            await createPeptideosAccount(userId, hid);
          },
          createSignedSession: async (userId) => {
            const res = await createTrustedBetterAuthSession(userId);
            if (res) {
              signInHolder.response = res;
              return true;
            }
            return false;
          }
        });

        if (!completed.ok) {
          return {
            value: ssoJson({ error: completed.error }, completed.status),
            disposition: handoffDisposition(completed.status, completed.wroteUserState)
          };
        }
        if (!signInHolder.response) {
          return {
            value: ssoJson({ error: "sso_signin_failed" }, 500),
            disposition: handoffDisposition(500, completed.wroteUserState)
          };
        }
        return { value: finalizeSession(signInHolder.response), disposition: "keep" as const };
      },
    );

    if (claimed.outcome === "invalid_or_expired_handoff") {
      return ssoJson({ error: "invalid_or_expired_handoff" }, 400);
    }
    if (claimed.outcome === "error") {
      console.error("[peptideos-wc-sso] claimed run:", claimed.error);
      return ssoJson({ error: "sso_internal_error", ...ssoExplain(claimed.error) }, 500);
    }
    return claimed.value;
  } catch (e) {
    console.error("[peptideos-wc-sso] unhandled:", e);
    return ssoJson({ error: "sso_internal_error", ...ssoExplain(e) }, 500);
  }
}
