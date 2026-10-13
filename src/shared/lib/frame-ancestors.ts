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

/**
 * Put `frame-ancestors` on one CSP header.
 * A stricter `frame-ancestors 'none'` (sign-out confirm and continue) is kept.
 * Any other existing `frame-ancestors` source list is replaced so a second CSP
 * header is never added.
 */
export function mergeFrameAncestors(existingCsp?: string | null): string {
  const current = existingCsp?.trim();
  if (!current) {
    return FRAME_ANCESTORS_CSP;
  }
  if (/frame-ancestors\s+'none'/i.test(current)) {
    return current;
  }
  if (/frame-ancestors\b/i.test(current)) {
    return current.replace(/frame-ancestors\s+[^;]+/gi, FRAME_ANCESTORS_CSP);
  }
  return `${current.replace(/;+\s*$/, "")}; ${FRAME_ANCESTORS_CSP}`;
}

export function applyFrameAncestorsHeader(headers: Headers): void {
  headers.set("Content-Security-Policy", mergeFrameAncestors(headers.get("Content-Security-Policy")));
}
