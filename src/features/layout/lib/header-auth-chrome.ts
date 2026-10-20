export const headerAuthChromeState = {
  pending: "pending",
  signedOut: "signed-out",
  signedIn: "signed-in"
} as const;

export type HeaderAuthChrome = (typeof headerAuthChromeState)[keyof typeof headerAuthChromeState];

/** Which header auth slot to paint. A session is signed-in even while pending; pending is only the no-session wait. */
export function headerAuthChrome(isPending: boolean, hasSession: boolean): HeaderAuthChrome {
  if (hasSession) return headerAuthChromeState.signedIn;
  if (isPending) return headerAuthChromeState.pending;
  return headerAuthChromeState.signedOut;
}
