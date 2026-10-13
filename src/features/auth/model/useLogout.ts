"use client";

import { usePathname } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { postEmbedLogoutToParent } from "@/features/embed/lib/embed-mode";
import { markExplicitEmbedLogout } from "@/features/embed/lib/embed-bridge";
import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "";

  return useMutation({
    mutationFn: async () => {
      // signOutAction redirects to /auth/signout/continue and throws, so wc:signed-out
      // is posted first. The parent navigates the top window. This frame must not sign PeptideOS out.
      // The mark only blocks wc:session signed-out if this page drops its session first.
      markExplicitEmbedLogout(pathname);
      postEmbedLogoutToParent();
      await logoutThenClearSession(
        () => signOutAction(),
        () => queryClient.invalidateQueries({ queryKey: ["session"] })
      );
    }
  });
};
