"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { logSsoEvent } from "../../../../../app/api/peptideos-wc-sso/sso-error-log";

import {
  SIGNOUT_CONTINUE_COOKIE,
  issueSignoutContinueToken,
  signoutContinueCookieOptions
} from "@/features/auth/signout/lib/signout-continue-token";
import { auth } from "@/features/auth/lib/better-auth";

async function issueSignoutContinueCookie() {
  const store = await cookies();
  store.set(SIGNOUT_CONTINUE_COOKIE, issueSignoutContinueToken(), signoutContinueCookieOptions());
}

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    logSsoEvent("wc_signout", error);
  }

  await issueSignoutContinueCookie();
  redirect("/auth/signout/continue");
}
