/** Client logout: end the WC session before dropping cached session data. */
export async function logoutThenClearSession(
  signOut: () => Promise<unknown>,
  clearSessionQuery: () => unknown | Promise<unknown>
): Promise<void> {
  await signOut();
  await clearSessionQuery();
}
