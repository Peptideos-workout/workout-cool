"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getConfiguredPeptideOsWorkoutsSignoutUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { authClient } from "@/features/auth/lib/auth-client";

export const useLogout = (_redirectUrl: string = "/") => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await authClient.signOut();
      queryClient.invalidateQueries({ queryKey: ["session"] });
      window.location.assign(getConfiguredPeptideOsWorkoutsSignoutUrl());
    }
  });
};
