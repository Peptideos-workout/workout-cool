"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { postEmbedLogoutToParent } from "@/features/embed/lib/embed-mode";
import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // The server action redirects, so this post has to happen first.
      // The parent navigates the top window. This frame must not sign PeptideOS out.
      postEmbedLogoutToParent();
      await logoutThenClearSession(
        () => signOutAction(),
        () => queryClient.invalidateQueries({ queryKey: ["session"] })
      );
    }
  });
};
