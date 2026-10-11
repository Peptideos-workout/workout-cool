import { NextResponse } from "next/server";

export function ssoJson(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
