export const headerAuthChromeState = {
  pending: "pending",
  signedOut: "signed-out",
  signedIn: "signed-in"
} as const;

export type HeaderAuthChrome = (typeof headerAuthChromeState)[keyof typeof headerAuthChromeState];

/** How long a session-less pending header waits before showing signed-out. */
export const HEADER_AUTH_PENDING_TIMEOUT_MS = 8000;

/**
 * Which header auth slot to paint.
 * A session is signed-in even while pending.
 * Pending is only the no-session wait. timedOut ends that wait as signed-out.
 */
export function headerAuthChrome(isPending: boolean, hasSession: boolean, timedOut = false): HeaderAuthChrome {
  if (hasSession) return headerAuthChromeState.signedIn;
  if (isPending && !timedOut) return headerAuthChromeState.pending;
  return headerAuthChromeState.signedOut;
}
