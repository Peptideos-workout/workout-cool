"use client";

import { LockKeyhole } from "lucide-react";
import { useI18n } from "locales/client";

import { PASSWORD_CHANGE_KIND, passwordChangeFromUnknown } from "../lib/password-change-entry";

import { getConfiguredPeptideOsSettingsUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";
import { Link } from "@/components/ui/link";

export function ChangePasswordMenuItem() {
  const t = useI18n();
  const session = useSession();
  const entry = passwordChangeFromUnknown((session.data?.user as { passwordChange?: unknown } | undefined)?.passwordChange);

  if (entry.kind === PASSWORD_CHANGE_KIND.hidden) {
    return null;
  }

  const href =
    entry.kind === PASSWORD_CHANGE_KIND.peptideosSettings
      ? getConfiguredPeptideOsSettingsUrl(`${window.location.pathname}${window.location.search}`)
      : "/profile#password";

  return (
    <li>
      <Link className="!no-underline" href={href} size="base" variant="nav">
        <LockKeyhole className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        {t("commons.change_password")}
      </Link>
    </li>
  );
}
