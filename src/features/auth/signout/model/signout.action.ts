"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { logSsoEvent } from "../../../../../app/api/peptideos-wc-sso/sso-error-log";

import {
  EMBED_COOKIE_NAME,
  isExplicitEmbedSignOutSignal,
  shouldSkipEmbedSignOut
} from "@/features/embed/lib/embed-mode";
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

export async function signOutAction(input?: { embedded?: boolean }) {
  const store = await cookies();
  // No-op only for an explicit framed request that also has the embed cookie.
  // A top-level tab shares that cookie and must still sign out.
  if (
    shouldSkipEmbedSignOut({
      clientEmbedded: isExplicitEmbedSignOutSignal(input),
      embedCookie: store.get(EMBED_COOKIE_NAME)?.value
    })
  ) {
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
