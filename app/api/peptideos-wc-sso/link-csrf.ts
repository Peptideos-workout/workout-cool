export function isTrustedMutationOrigin(originHeader: string | null, trustedOrigins: string[]): boolean {
  if (!originHeader) return false;
  try {
    return trustedOrigins.includes(new URL(originHeader).origin);
  } catch {
    return false;
  }
}
