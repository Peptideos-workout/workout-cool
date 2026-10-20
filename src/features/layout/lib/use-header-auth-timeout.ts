"use client";

import { useEffect, useState } from "react";

import { HEADER_AUTH_PENDING_TIMEOUT_MS } from "./header-auth-chrome";

/** Flips to timed-out after the pending wait when there is still no session. Cleared on unmount. */
export function useHeaderAuthTimedOut(isPending: boolean, hasSession: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending || hasSession) {
      setTimedOut(false);
      return;
    }
    const timeoutId = setTimeout(() => {
      setTimedOut(true);
    }, HEADER_AUTH_PENDING_TIMEOUT_MS);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasSession, isPending]);

  return timedOut;
}
