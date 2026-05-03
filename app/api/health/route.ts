import { NextResponse } from "next/server";

/** Liveness check: no DB/auth — use to verify the server process is listening. */
export function GET() {
  return NextResponse.json({ ok: true });
}
