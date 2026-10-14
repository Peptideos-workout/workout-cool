"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { isEmbedFrame, postEmbedLogoutToParent } from "@/features/embed/lib/embed-mode";
import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // An embedded frame has no sign-out of its own. Post wc:signed-out and stop.
      // PeptideOS dashboard Sign out is the only logout. A normal tab still runs
      // signOutAction, which redirects to /auth/signout/continue.
      if (isEmbedFrame()) {
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
