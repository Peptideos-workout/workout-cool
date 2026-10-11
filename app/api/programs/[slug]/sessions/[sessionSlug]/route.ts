import { NextResponse } from "next/server";

import { PROGRAM_SESSION_API_IS_PUBLIC, programSessionApiUnauthorizedBody } from "@/features/programs/lib/session-api-access";
import { getSessionBySlug } from "@/features/programs/actions/get-session-by-slug.action";
import { auth } from "@/features/auth/lib/better-auth";

/**
 * Published program session catalog (exercises, videos, suggested sets).
 * Gated because the matching page is gated and this is not public JSON.
 * See PROGRAM_SESSION_API_IS_PUBLIC in session-api-access.ts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; sessionSlug: string }> }) {
  void PROGRAM_SESSION_API_IS_PUBLIC;

  try {
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session) {
      return NextResponse.json(programSessionApiUnauthorizedBody(), {
        status: 401,
        headers: { "Cache-Control": "private, no-store" }
      });
    }

    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || "fr";

    const { slug, sessionSlug } = await params;
    const sessionDetail = await getSessionBySlug(slug, sessionSlug, locale as any);

    if (!sessionDetail) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(sessionDetail);
  } catch (error) {
    console.error("Error fetching session:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
