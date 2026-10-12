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

import { UserRole } from "@prisma/client";

import { configuredWorkoutOrigin } from "./workout-origin";
import { newUnusedSsoPassword } from "./unused-sso-password";
import { createTrustedBetterAuthSession } from "./trusted-session";
import { runPeptideOsSso } from "./run-sso";
import { PEPTIDEOS_PROVIDER } from "./resolve-sso-account";
import { createPeptideosAccountLink } from "./create-peptideos-account";
import { lookupUnconsumedHandoffByHash } from "./consume-handoff";

import type { NextRequest } from "next/server";
import type { SsoAccountSnapshot } from "./resolve-sso-account";

import { prisma } from "@/shared/lib/prisma";
import { runWithSsoUserCreate } from "@/features/auth/lib/sso-user-create-context";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

function workoutOrigin(): string {
  return configuredWorkoutOrigin(env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL);
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
  return createPeptideosAccountLink({
    userId,
    peptideosUserId,
    insert: async () => {
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
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return runPeptideOsSso(request, {
    claimByHash: (tokenHash) => lookupUnconsumedHandoffByHash(prisma, tokenHash),
    lookupAuthUser: async (hid) => {
      const userRows = await prisma.$queryRaw<{ email: string; meta: unknown }[]>`
      SELECT email, raw_user_meta_data AS meta
      FROM auth.users
      WHERE id::text = ${hid}
      LIMIT 1
    `;
      const row = userRows[0];
      return row ? { email: row.email, meta: row.meta } : null;
    },
    loadSsoAccountSnapshot,
    findUserByEmail: async (email) => prisma.user.findUnique({ where: { email }, select: { id: true } }),
    signUp: async ({ email, firstName, lastName, name, headers }) => {
      const unusedPassword = newUnusedSsoPassword();
      const created = await runWithSsoUserCreate(() =>
        auth.api.signUpEmail({
          body: {
            email,
            password: unusedPassword,
            name,
            firstName,
            lastName,
            role: UserRole.user
          },
          headers
        })
      );
      const userId = created?.user?.id;
      return userId ? { userId } : null;
    },
    createPeptideosAccount,
    findPeptideosAccountByUserId: async (userId) =>
      prisma.account.findFirst({
        where: { userId, providerId: PEPTIDEOS_PROVIDER },
        select: { accountId: true }
      }),
    createSignedSession: (userId) => createTrustedBetterAuthSession(userId),
    workoutOrigin: workoutOrigin()
  });
}
