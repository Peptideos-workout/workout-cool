export const headerAuthChromeState = {
  pending: "pending",
  signedOut: "signed-out",
  signedIn: "signed-in"
} as const;

export type HeaderAuthChrome = (typeof headerAuthChromeState)[keyof typeof headerAuthChromeState];

/** Which header auth slot to paint. Pending hides both Login/Sign up and the avatar. */
export function headerAuthChrome(isPending: boolean, hasSession: boolean): HeaderAuthChrome {
  if (isPending) return headerAuthChromeState.pending;
  if (!hasSession) return headerAuthChromeState.signedOut;
  return headerAuthChromeState.signedIn;
}
