"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "locales/client";

import { EmbedAuthFallbackView } from "./embed-auth-fallback-view";

import { isSsoFailureCode, shouldShowEmbedAuthFallback } from "@/features/embed/lib/embed-mode";
import {
  embedReportedSession,
  explicitEmbedLogoutOnPath,
  postEmbedSession,
  releaseExplicitEmbedLogout,
  sessionReportToSend,
  type EmbedSessionState
} from "@/features/embed/lib/embed-bridge";
import {
  getConfiguredPeptideOsLoginUrl,
  getConfiguredPeptideOsOrigin,
  getConfiguredPeptideOsSignupUrl
} from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";

export function EmbedAuthFallback() {
  const session = useSession();
  const params = useSearchParams();
  const pathname = usePathname() ?? "";
  const t = useI18n();
  const [embed, setEmbed] = useState(false);
  const reportedSession = useRef<EmbedSessionState | null>(null);
  const ssoError = isSsoFailureCode(params.get("error"));
  const sessionResolved = !session.isPending;
  const hasSession = Boolean(session.data);

  useEffect(() => {
    setEmbed(document.documentElement.getAttribute("data-wc-embed") === "1");
  }, []);

  useEffect(() => {
    const embedOn = document.documentElement.getAttribute("data-wc-embed") === "1";
    releaseExplicitEmbedLogout(pathname);
    const next = embedReportedSession({
      embed: embedOn,
      sessionResolved,
      hasSession,
      ssoError,
      pathname,
      explicitLogout: explicitEmbedLogoutOnPath(pathname)
    });
    const state = sessionReportToSend(reportedSession.current, next);
    if (!state) return;
    const sent = postEmbedSession(getConfiguredPeptideOsOrigin(), state);
    if (sent) reportedSession.current = state;
  }, [hasSession, pathname, sessionResolved, ssoError]);

  const show = shouldShowEmbedAuthFallback({
    embed,
    sessionResolved,
    hasSession,
    ssoError
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
