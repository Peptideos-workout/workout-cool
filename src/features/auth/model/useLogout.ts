"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { signOutAction } from "@/features/auth/signout/model/signout.action";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
      await signOutAction();
    }
  });
};
