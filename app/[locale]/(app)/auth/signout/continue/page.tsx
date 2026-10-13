import { headers } from "next/headers";
import { getI18n } from "locales/server";

import { SignoutPendingNotice } from "@/features/auth/signout/ui/signout-pending-notice";
import { PeptideOsSignoutHandoff } from "@/features/auth/signout/ui/peptideos-signout-handoff";
import { isSignoutContinueAutoSubmitHeader } from "@/features/auth/signout/lib/signout-continue-token";
import { trustedPeptideOsHref } from "@/features/auth/lib/trusted-peptideos-href";
import {
  getConfiguredPeptideOsOrigin,
  getConfiguredPeptideOsWorkoutsSignoutActionUrl,
  getConfiguredPeptideOsWorkoutsSignoutHomeRedirect
} from "@/features/auth/lib/configured-peptideos-signup";
import { Link } from "@/components/ui/link";

export const dynamic = "force-dynamic";

export default async function AuthSignOutContinuePage() {
  const t = await getI18n();
  const actionUrl = trustedPeptideOsHref(getConfiguredPeptideOsWorkoutsSignoutActionUrl(), getConfiguredPeptideOsOrigin());
  const redirect = getConfiguredPeptideOsWorkoutsSignoutHomeRedirect();
  const autoSubmit = isSignoutContinueAutoSubmitHeader(await headers());

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      {actionUrl ? (
        <div
          className="flex w-full max-w-sm flex-col items-center gap-4 text-center"
          data-signout-handoff={autoSubmit ? "auto-submit" : "confirm"}
          data-wc-signout=""
        >
          {autoSubmit ? (
            <SignoutPendingNotice label={t("signout_pending_title")} />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{t("signout_confirm_title")}</h1>
          )}
          {autoSubmit ? (
            <noscript>
              <style>{".signout-continue-fallback{display:inline-flex !important}"}</style>
            </noscript>
          ) : null}
          <PeptideOsSignoutHandoff
            actionUrl={actionUrl}
            autoSubmit={autoSubmit}
            fallbackLabel={t("signout_pending_fallback")}
            redirect={redirect}
            submitLabel={t("logout")}
          />
        </div>
      ) : (
        <Link href="/" size="sm" variant="button">
          {t("commons.home")}
        </Link>
      )}
    </div>
  );
}
