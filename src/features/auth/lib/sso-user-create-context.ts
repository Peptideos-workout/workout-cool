import { AsyncLocalStorage } from "node:async_hooks";

import { shouldAllowBetterAuthUserCreate, shouldAllowOAuthNewUser } from "./block-public-signup";

const ssoUserCreate = new AsyncLocalStorage<true>();

/** In-process only. Never read from the request or other client input. */
export function runWithSsoUserCreate<T>(fn: () => T): T {
  return ssoUserCreate.run(true, fn);
}

export function isSsoUserCreateAllowed(): boolean {
  return ssoUserCreate.getStore() === true;
}

export function allowBetterAuthUserCreate(): boolean {
  const isSsoContext = isSsoUserCreateAllowed();
  return shouldAllowBetterAuthUserCreate(isSsoContext) && shouldAllowOAuthNewUser(isSsoContext);
}
