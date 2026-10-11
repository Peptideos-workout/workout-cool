/** Client-side check: `passwordChange.href` must be http(s) on the configured PeptideOS origin. */
export function trustedPeptideOsHref(href: string | undefined, peptideOsOrigin: string): string | undefined {
  const dest = href?.trim();
  const base = peptideOsOrigin.trim();
  if (!dest || !base) {
    return undefined;
  }

  try {
    const destUrl = new URL(dest);
    const origin = new URL(base).origin;
    if (destUrl.protocol !== "https:" && destUrl.protocol !== "http:") {
      return undefined;
    }
    if (destUrl.username || destUrl.password) {
      return undefined;
    }
    if (destUrl.origin !== origin) {
      return undefined;
    }
    return destUrl.toString();
  } catch {
    return undefined;
  }
}
