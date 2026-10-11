export const PEPTIDEOS_PROVIDER_ID = "peptideos";

export const PASSWORD_CHANGE_KIND = {
  hidden: "hidden",
  peptideosSettings: "peptideos_settings"
} as const;

export type PasswordChangeKind = (typeof PASSWORD_CHANGE_KIND)[keyof typeof PASSWORD_CHANGE_KIND];

export type PasswordChangeEntry =
  | { kind: typeof PASSWORD_CHANGE_KIND.hidden }
  | { kind: typeof PASSWORD_CHANGE_KIND.peptideosSettings; href: string };

export interface ResolvePasswordChangeKindInput {
  accounts: { providerId: string }[] | undefined;
  hasEmailIdentity: boolean | null | undefined;
  peptideosSettingsUrl: string;
}

export function resolvePasswordChangeKind(input: ResolvePasswordChangeKindInput): PasswordChangeEntry {
  const accounts = input.accounts ?? [];
  const hasPeptideos = accounts.some((account) => account.providerId === PEPTIDEOS_PROVIDER_ID);

  if (hasPeptideos && input.hasEmailIdentity === true && input.peptideosSettingsUrl) {
    return { kind: PASSWORD_CHANGE_KIND.peptideosSettings, href: input.peptideosSettingsUrl };
  }

  return { kind: PASSWORD_CHANGE_KIND.hidden };
}

export function passwordChangeFromUnknown(value: unknown): PasswordChangeEntry {
  if (!value || typeof value !== "object") {
    return { kind: PASSWORD_CHANGE_KIND.hidden };
  }

  const kind = "kind" in value ? value.kind : null;
  if (kind === PASSWORD_CHANGE_KIND.peptideosSettings) {
    const href = "href" in value && typeof value.href === "string" ? value.href : "";
    if (href) {
      return { kind: PASSWORD_CHANGE_KIND.peptideosSettings, href };
    }
  }

  return { kind: PASSWORD_CHANGE_KIND.hidden };
}
