import type { HandoffDisposition } from "./consume-handoff";

/** A claimed handoff stays consumed after every outcome, including a failed sign-in. */
export function handoffDisposition(): HandoffDisposition {
  return "keep";
}
