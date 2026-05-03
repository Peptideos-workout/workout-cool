"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, customSessionClient, inferAdditionalFields } from "better-auth/client/plugins";

import { auth } from "@/features/auth/lib/better-auth";

/**
 * Better Auth resolves `NEXT_PUBLIC_*` env before `window` when baseURL is left for its defaults.
 * Docker builds often inline localhost into `NEXT_PUBLIC_APP_URL`, which then steals redirects/API calls.
 */
function authBaseURL(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (u) {
    try {
      return new URL(u).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: authBaseURL(),
  plugins: [adminClient(), customSessionClient<typeof auth>(), inferAdditionalFields<typeof auth>()],
});

export const useIsAdmin = () => {
  const { data: sessionData, isPending: isSessionLoading } = useSession();
  return !isSessionLoading && sessionData?.user?.role?.includes("admin");
};

export const { useSession } = authClient;
