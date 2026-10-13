"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { logSsoEvent } from "../../../../../app/api/peptideos-wc-sso/sso-error-log";

import { EMBED_COOKIE_NAME } from "@/features/embed/lib/embed-mode";
import {
  issueSignoutContinueToken,
  signoutContinueCookieName,
  signoutContinueCookieOptions
} from "@/features/auth/signout/lib/signout-continue-token";
import { auth } from "@/features/auth/lib/better-auth";

async function issueSignoutContinueCookie() {
  const token = issueSignoutContinueToken();
  if (!token) {
    return;
  }

  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  store.set(signoutContinueCookieName(secure), token, signoutContinueCookieOptions(secure));
}

export async function signOutAction() {
  const store = await cookies();
  // Embed logout is a no-op. Do not clear the session and do not start hop B.
  if (store.get(EMBED_COOKIE_NAME)?.value === "1") {
    return;
  }

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    logSsoEvent("wc_signout", error);
  }

  await issueSignoutContinueCookie();
  redirect("/auth/signout/continue");
}
