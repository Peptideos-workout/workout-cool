"use client";

import { useState } from "react";

interface UseLinkPeptideosResult {
  isSubmitting: boolean;
  errorMessage: string | null;
  linkAccount: (password: string) => Promise<void>;
}

export function useLinkPeptideos(): UseLinkPeptideosResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const linkAccount = async (password: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/peptideos-wc-sso/link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; redirectTo?: string; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setErrorMessage("generic");
        return;
      }
      window.location.assign(body.redirectTo || "/");
    } catch {
      setErrorMessage("generic");
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, errorMessage, linkAccount };
}
