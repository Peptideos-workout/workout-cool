import { getI18n } from "locales/server";

import { PeptideOsSignoutHandoff } from "@/features/auth/signout/ui/peptideos-signout-handoff";
import { trustedPeptideOsHref } from "@/features/auth/lib/trusted-peptideos-href";
import {
  getConfiguredPeptideOsOrigin,
  getConfiguredPeptideOsWorkoutsSignoutActionUrl,
  getConfiguredPeptideOsWorkoutsSignoutHomeRedirect
} from "@/features/auth/lib/configured-peptideos-signup";
import { Link } from "@/components/ui/link";

export default async function AuthSignOutContinuePage() {
  const t = await getI18n();
  const actionUrl = trustedPeptideOsHref(getConfiguredPeptideOsWorkoutsSignoutActionUrl(), getConfiguredPeptideOsOrigin());
  const redirect = getConfiguredPeptideOsWorkoutsSignoutHomeRedirect();

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      {actionUrl ? (
        <PeptideOsSignoutHandoff actionUrl={actionUrl} redirect={redirect} submitLabel={t("logout")} />
      ) : (
        <Link href="/" size="sm" variant="button">
          {t("commons.home")}
        </Link>
      )}
    </div>
  );
}
