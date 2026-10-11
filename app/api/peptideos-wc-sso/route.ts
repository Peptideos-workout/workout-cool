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

import { deriveWorkoutCoolCredentialFromSupabaseJwtSecret } from "./derive-wc-password";
import { consumeWorkoutCoolHandoff, lookupUnconsumedHandoffByHash } from "./consume-handoff";

import type { NextRequest } from "next/server";

import { prisma } from "@/shared/lib/prisma";
import { hashStringWithSalt } from "@/features/update-password/lib/hash";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

const CREDENTIAL_PROVIDER = "credential";

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Public origin for Set-Cookie + post-login Location. Prefer Cloudflare forwards; fall back only when tunnel/proxy exposes
 * a loopback Host or request.url is wrong; last resort BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL.
 */
function workoutOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    try {
      return new URL(`${forwardedProto}://${forwardedHost}`).origin;
    } catch {
      /* ignore */
    }
  }

  const fromRequest = request.nextUrl.origin;

  if (!isLoopbackOrigin(fromRequest)) {
    return fromRequest;
  }

  const publicUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    try {
      return new URL(publicUrl).origin;
    } catch {
      /* ignore */
    }
  }

  return fromRequest;
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
      headers: request.headers,
    })) as Response;
  } catch {
    return null;
  }
}

async function finalizeSession(request: NextRequest, signInRes: Response): Promise<NextResponse> {
  const home = `${workoutOrigin(request)}/`;
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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 16) {
    return NextResponse.json({ error: "SUPABASE_JWT_SECRET not configured" }, { status: 503 });
  }

  const tokenParam = request.nextUrl.searchParams.get("token")?.trim();
  if (!tokenParam) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  try {
    let hid: string | null;
    try {
      hid = await consumeWorkoutCoolHandoff(tokenParam, (tokenHash) => lookupUnconsumedHandoffByHash(prisma, tokenHash));
    } catch (e) {
      console.error("[peptideos-wc-sso] workout_cool_handoffs consume:", e);
      return NextResponse.json({ error: "database_error", ...ssoExplain(e) }, { status: 500 });
    }

    if (!hid) return NextResponse.json({ error: "invalid_or_expired_handoff" }, { status: 400 });

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
      supabaseUserId: hid,
    });

    let res = await trySignIn(request, email, pw);
    if (res?.ok) return finalizeSession(request, res);

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (!existingUser) {
      const { firstName, lastName, name } = splitName(displayName, email);
      try {
        await auth.api.signUpEmail({
          body: {
            email,
            password: pw,
            name,
            firstName,
            lastName,
            role: UserRole.user,
          },
          headers: request.headers,
        });
      } catch {
        /* race */
      }
      res = await trySignIn(request, email, pw);
      if (res?.ok) return finalizeSession(request, res);
      return NextResponse.json({ error: "sso_signup_failed" }, { status: 500 });
    }

    const hash = hashStringWithSalt(pw, env.BETTER_AUTH_SECRET);
    const cred = await prisma.account.findFirst({
      where: { userId: existingUser.id, providerId: CREDENTIAL_PROVIDER },
    });
    if (!cred) {
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: email,
          providerId: CREDENTIAL_PROVIDER,
          userId: existingUser.id,
          password: hash,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.account.update({
        where: { id: cred.id },
        data: { password: hash, updatedAt: new Date() },
      });
    }

    res = await trySignIn(request, email, pw);
    if (!res?.ok) return NextResponse.json({ error: "sso_signin_failed" }, { status: 500 });
    return finalizeSession(request, res);
  } catch (e) {
    console.error("[peptideos-wc-sso] unhandled:", e);
    return NextResponse.json({ error: "sso_internal_error", ...ssoExplain(e) }, { status: 500 });
  }
}
