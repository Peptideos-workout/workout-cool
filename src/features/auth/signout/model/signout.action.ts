"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { logSsoEvent } from "../../../../../app/api/peptideos-wc-sso/sso-error-log";

import { auth } from "@/features/auth/lib/better-auth";

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    logSsoEvent("wc_signout", error);
  }

  redirect("/auth/signout/continue");
}
