"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { notifyEmbedSignedOut } from "@/features/embed/lib/embed-bridge";
import { signOutAction } from "@/features/auth/signout/model/signout.action";
import { getConfiguredPeptideOsOrigin } from "@/features/auth/lib/configured-peptideos-signup";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await logoutThenClearSession(
        () => signOutAction(),
        () => queryClient.invalidateQueries({ queryKey: ["session"] })
      );
      notifyEmbedSignedOut(getConfiguredPeptideOsOrigin());
    }
  });
};
