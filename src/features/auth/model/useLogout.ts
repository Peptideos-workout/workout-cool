"use client";

import { usePathname } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { isEmbedFrame, postEmbedLogoutToParent } from "@/features/embed/lib/embed-mode";
import { markExplicitEmbedLogout } from "@/features/embed/lib/embed-bridge";
import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "";

  return useMutation({
    mutationFn: async () => {
      // An embedded frame has no sign-out of its own. Post wc:signed-out and stop.
      // PeptideOS dashboard Sign out is the only logout. A normal tab still runs
      // signOutAction, which redirects to /auth/signout/continue.
      // The mark only blocks wc:session signed-out if this page drops its session first.
      if (isEmbedFrame()) {
        markExplicitEmbedLogout(pathname);
        postEmbedLogoutToParent();
        return;
      }
      await logoutThenClearSession(
        () => signOutAction(),
        () => queryClient.invalidateQueries({ queryKey: ["session"] })
      );
    }
  });
};
