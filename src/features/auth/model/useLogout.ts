"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutThenClearSession } from "./logout-then-clear-session";

import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await logoutThenClearSession(
        () => signOutAction(),
        () => queryClient.invalidateQueries({ queryKey: ["session"] })
      );
    }
  });
};
