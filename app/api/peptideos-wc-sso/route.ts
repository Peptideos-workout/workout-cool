/**
 * PeptideOS → Workout.cool SSO (MIT drop-in): `app/api/peptideos-wc-sso/route.ts`
 *
 * Routed **outside** `/api/auth/` so Better Auth’s `app/api/auth/[...all]/route.ts`
 * cannot intercept this path (production often 404 otherwise).
 *
 * Requirements:
 *   • DATABASE_URL = same Supabase Postgres as PeptideOS (pooler/direct URI from Dashboard → Database).
 *   • SUPABASE_JWT_SECRET = same value as PeptideOS (Dashboard → Settings → API → JWT Secret).
 *   • Run Peptide migration `20260426120000_workout_cool_handoffs.sql` on that DB (included in peptideos repo).
 *   • PeptideOS PR #22 stores `secret_token` as sha256(rawToken) hex — never compare plaintext.
 */
import crypto from "crypto";

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { configuredWorkoutOrigin } from "./workout-origin";
import { createTrustedBetterAuthSession } from "./trusted-session";
import { CREDENTIAL_PROVIDER, PEPTIDEOS_PROVIDER } from "./resolve-sso-account";
import { deriveWorkoutCoolCredentialFromSupabaseJwtSecret } from "./derive-wc-password";
import { lookupUnconsumedHandoffByHash, releaseHandoffClaimByHash, runWithHandoffClaim } from "./consume-handoff";
import { completePeptideOsSsoLogin } from "./complete-sso";

import type { NextRequest } from "next/server";
import type { SsoAccountSnapshot } from "./resolve-sso-account";

import { prisma } from "@/shared/lib/prisma";
import { hashStringWithSalt } from "@/features/update-password/lib/hash";
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

async function trySignIn(request: NextRequest, email: string, password: string): Promise<Response | null> {
  try {
    return (await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
      headers: request.headers
    })) as Response;
  } catch {
    return null;
  }
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
    include: { accounts: { select: { id: true, providerId: true, accountId: true, password: true } } }
  });

  if (!existingUser) {
    return { existingUser: null, existingCredential: null, peptideosAccountId: null };
  }

  const existingCredential = existingUser.accounts.find((account) => account.providerId === CREDENTIAL_PROVIDER);
  const peptideosAccount = existingUser.accounts.find((account) => account.providerId === PEPTIDEOS_PROVIDER);

  return {
    existingUser: { id: existingUser.id },
    existingCredential: existingCredential
      ? { id: existingCredential.id, password: existingCredential.password }
      : null,
    peptideosAccountId: peptideosAccount?.accountId ?? null
  };
}

async function createAccount(data: { accountId: string; providerId: string; userId: string; password?: string }) {
  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: data.accountId,
      providerId: data.providerId,
      userId: data.userId,
      password: data.password,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
}

function isRedirectResponse(response: NextResponse): boolean {
  return response.status >= 300 && response.status < 400;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 16) {
    return NextResponse.json({ error: "SUPABASE_JWT_SECRET not configured" }, { status: 503 });
  }

  const tokenParam = request.nextUrl.searchParams.get("token")?.trim();
  if (!tokenParam) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  try {
    const claimed = await runWithHandoffClaim(
      tokenParam,
      {
        claimByHash: (tokenHash) => lookupUnconsumedHandoffByHash(prisma, tokenHash),
        releaseByHash: (tokenHash) => releaseHandoffClaimByHash(prisma, tokenHash)
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
          return NextResponse.json({ error: "auth_users_lookup_failed", ...ssoExplain(e) }, { status: 500 });
        }

        const email = userRows[0]?.email?.trim().toLowerCase();
        if (!email) return NextResponse.json({ error: "missing_email" }, { status: 500 });

        const displayName = metaDisplayName(userRows[0]?.meta);
        const pw = deriveWorkoutCoolCredentialFromSupabaseJwtSecret({
          supabaseJwtSecret: jwtSecret,
          email,
          supabaseUserId: hid
        });
        const derivedPasswordHash = hashStringWithSalt(pw, env.BETTER_AUTH_SECRET);
        const snapshot = await loadSsoAccountSnapshot(email);

        const completed = await completePeptideOsSsoLogin(hid, derivedPasswordHash, snapshot, {
          signUpNewUser: async () => {
            const { firstName, lastName, name } = splitName(displayName, email);
            try {
              await auth.api.signUpEmail({
                body: {
                  email,
                  password: pw,
                  name,
                  firstName,
                  lastName,
                  role: UserRole.user
                },
                headers: request.headers
              });
            } catch {
              /* race: another request may have created the user */
            }
            const created = await prisma.user.findUnique({ where: { email } });
            if (!created) throw new Error("sso_signup_failed");
            return { userId: created.id };
          },
          createCredential: async (userId) => {
            await createAccount({
              accountId: email,
              providerId: CREDENTIAL_PROVIDER,
              userId,
              password: derivedPasswordHash
            });
          },
          createPeptideosAccount: async (userId) => {
            await createAccount({
              accountId: hid,
              providerId: PEPTIDEOS_PROVIDER,
              userId
            });
          },
          updateCredentialPassword: async () => {
            throw new Error("SSO must never overwrite an existing credential");
          },
          signInWithDerivedPassword: async () => {
            const res = await trySignIn(request, email, pw);
            if (res?.ok) {
              signInHolder.response = res;
              return true;
            }
            return false;
          },
          signInWithTrustedSession: async (userId) => {
            const res = await createTrustedBetterAuthSession(userId);
            if (res) {
              signInHolder.response = res;
              return true;
            }
            return false;
          }
        });

        if (!completed.ok) {
          return NextResponse.json({ error: completed.error }, { status: completed.status });
        }
        if (!signInHolder.response) {
          return NextResponse.json({ error: "sso_signin_failed" }, { status: 500 });
        }
        return finalizeSession(signInHolder.response);
      },
      isRedirectResponse,
    );

    if (claimed.outcome === "invalid_or_expired_handoff") {
      return NextResponse.json({ error: "invalid_or_expired_handoff" }, { status: 400 });
    }
    if (claimed.outcome === "error") {
      console.error("[peptideos-wc-sso] claimed run:", claimed.error);
      return NextResponse.json({ error: "sso_internal_error", ...ssoExplain(claimed.error) }, { status: 500 });
    }
    return claimed.value;
  } catch (e) {
    console.error("[peptideos-wc-sso] unhandled:", e);
    return NextResponse.json({ error: "sso_internal_error", ...ssoExplain(e) }, { status: 500 });
  }
}
