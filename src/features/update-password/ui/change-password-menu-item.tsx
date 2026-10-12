"use client";

import { LockKeyhole } from "lucide-react";
import { useI18n } from "locales/client";

import { PASSWORD_CHANGE_KIND, passwordChangeFromUnknown } from "../lib/password-change-entry";

import { trustedPeptideOsHref } from "@/features/auth/lib/trusted-peptideos-href";
import { getConfiguredPeptideOsOrigin, getConfiguredPeptideOsSettingsUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";
import { Link } from "@/components/ui/link";

export function ChangePasswordMenuItem() {
  const t = useI18n();
  const session = useSession();
  const entry = passwordChangeFromUnknown((session.data?.user as { passwordChange?: unknown } | undefined)?.passwordChange);

  if (entry.kind !== PASSWORD_CHANGE_KIND.peptideosSettings) {
    return null;
  }

  const href =
    trustedPeptideOsHref(entry.href, getConfiguredPeptideOsOrigin()) ??
    getConfiguredPeptideOsSettingsUrl(`${window.location.pathname}${window.location.search}`);

  return (
    <li>
      <Link className="!no-underline" href={href} prefetch={false} size="base" variant="nav">
        <LockKeyhole className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        {t("commons.change_password")}
      </Link>
    </li>
  );
}
