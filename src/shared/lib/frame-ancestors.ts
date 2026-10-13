/**
 * Clickjacking allowlist for Workout.cool responses.
 *
 * `frame-ancestors` only decides which origins may embed the response in a
 * frame. A top-level POST from peptideos.us (the SSO handoff form) is ordinary
 * navigation, so this directive does not block it.
 *
 * X-Frame-Options is not set here. It cannot allowlist the PeptideOS origins,
 * and modern browsers ignore it once `frame-ancestors` is present.
 */
export const FRAME_ANCESTORS_CSP = "frame-ancestors 'self' https://peptideos.us https://www.peptideos.us";

/** True only when this directive's single source is `'none'`, in any letter case. */
function isExactFrameAncestorsNone(directive: string): boolean {
  return /^frame-ancestors\s+'none'$/i.test(directive);
}

/**
 * Put `frame-ancestors` on one CSP header.
 * An exact `frame-ancestors 'none'` (no other sources) is kept, in any letter case.
 * Any other source list, including `'none'` followed by another source, is
 * replaced so a second CSP header is never added.
 */
export function mergeFrameAncestors(existingCsp?: string | null): string {
  const current = existingCsp?.trim();
  if (!current) {
    return FRAME_ANCESTORS_CSP;
  }
  if (!/frame-ancestors\b/i.test(current)) {
    return `${current.replace(/;+\s*$/, "")}; ${FRAME_ANCESTORS_CSP}`;
  }

  const directives = current
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      if (!/^frame-ancestors\b/i.test(directive) || isExactFrameAncestorsNone(directive)) {
        return directive;
      }
      return FRAME_ANCESTORS_CSP;
    });
  return directives.join("; ");
}

export function applyFrameAncestorsHeader(headers: Headers): void {
  headers.set("Content-Security-Policy", mergeFrameAncestors(headers.get("Content-Security-Policy")));
}
