import { cookies } from "next/headers";
import { getI18n } from "locales/server";

import { PeptideOsSignoutHandoff } from "@/features/auth/signout/ui/peptideos-signout-handoff";
import { SIGNOUT_CONTINUE_COOKIE, signoutContinueView } from "@/features/auth/signout/lib/signout-continue-token";
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
  const store = await cookies();
  const autoSubmit = signoutContinueView(store.get(SIGNOUT_CONTINUE_COOKIE)?.value) === "auto-submit";

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      {actionUrl ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          {autoSubmit ? null : <h1 className="text-2xl font-semibold tracking-tight">{t("signout_confirm_title")}</h1>}
          <PeptideOsSignoutHandoff actionUrl={actionUrl} autoSubmit={autoSubmit} redirect={redirect} submitLabel={t("logout")} />
        </div>
      ) : (
        <Link href="/" size="sm" variant="button">
          {t("commons.home")}
        </Link>
      )}
    </div>
  );
}
