"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "locales/client";

import { EmbedAuthFallbackView } from "./embed-auth-fallback-view";

import { isSsoFailureCode, shouldShowEmbedAuthFallback } from "@/features/embed/lib/embed-mode";
import {
  getConfiguredPeptideOsLoginUrl,
  getConfiguredPeptideOsOrigin,
  getConfiguredPeptideOsSignupUrl
} from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";

export function EmbedAuthFallback() {
  const session = useSession();
  const params = useSearchParams();
  const t = useI18n();
  const [embed, setEmbed] = useState(false);

  useEffect(() => {
    setEmbed(document.documentElement.getAttribute("data-wc-embed") === "1");
  }, []);

  const show = shouldShowEmbedAuthFallback({
    embed,
    sessionResolved: !session.isPending,
    hasSession: Boolean(session.data),
    ssoError: isSsoFailureCode(params.get("error"))
  });

  if (!show) return null;

  return (
    <EmbedAuthFallbackView
      dashboardHref={`${getConfiguredPeptideOsOrigin()}/dashboard`}
      loginHref={getConfiguredPeptideOsLoginUrl()}
      loginLabel={t("commons.login")}
      signupHref={getConfiguredPeptideOsSignupUrl()}
      signupLabel={t("commons.signup")}
    />
  );
}
