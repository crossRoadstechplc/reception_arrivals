import { NextResponse } from "next/server";
import { requestLoginCode } from "@/lib/login-code";

/** Emails a 6-digit sign-in code to the app user. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const result = await requestLoginCode(typeof body?.email === "string" ? body.email : "");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
