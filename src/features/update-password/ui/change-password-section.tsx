"use client";

import { useI18n } from "locales/client";

import { PASSWORD_CHANGE_KIND, passwordChangeFromUnknown } from "../lib/password-change-entry";

import { trustedPeptideOsHref } from "@/features/auth/lib/trusted-peptideos-href";
import { getConfiguredPeptideOsOrigin, getConfiguredPeptideOsSettingsUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";
import { Link } from "@/components/ui/link";

export function ChangePasswordSection() {
  const t = useI18n();
  const session = useSession();
  const entry = passwordChangeFromUnknown((session.data?.user as { passwordChange?: unknown } | undefined)?.passwordChange);

  if (entry.kind !== PASSWORD_CHANGE_KIND.peptideosSettings) {
    return null;
  }

  const href =
    trustedPeptideOsHref(entry.href, getConfiguredPeptideOsOrigin()) ?? getConfiguredPeptideOsSettingsUrl("/profile");

  return (
    <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-gray-800" id="password">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("commons.change_password")}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("change_peptideos_password_description")}</p>
      <Link className="mt-3 inline-flex !no-underline" href={href} prefetch={false} size="base" variant="button">
        {t("change_peptideos_password_cta")}
      </Link>
    </section>
  );
}
