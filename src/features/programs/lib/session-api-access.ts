/**
 * GET /api/programs/[slug]/sessions/[sessionSlug] returns published program
 * session catalog: titles, descriptions, exercise names, video URLs, instructions,
 * and suggested sets. The matching page is already gated. Keep the API gated so
 * that content is not public JSON. Not a user-progress endpoint.
 */
export const PROGRAM_SESSION_API_IS_PUBLIC = false;

export function programSessionApiUnauthorizedBody() {
  return { error: "Unauthorized" };
}
