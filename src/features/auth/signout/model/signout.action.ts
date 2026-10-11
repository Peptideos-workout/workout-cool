"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getConfiguredPeptideOsWorkoutsSignoutUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { auth } from "@/features/auth/lib/better-auth";

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session may already be gone; still continue to PeptideOS sign-out.
  }

  redirect(getConfiguredPeptideOsWorkoutsSignoutUrl());
}
