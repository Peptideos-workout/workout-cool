import type { HandoffDisposition } from "./consume-handoff";

/** 409 burns the token. After any user/link/session write, never release. */
export function handoffDisposition(status: number, wroteUserState: boolean): HandoffDisposition {
  if (status === 409 || wroteUserState) return "keep";
  return "release";
}
