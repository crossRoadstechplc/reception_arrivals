import { NextResponse } from "next/server";
import { verifyLoginCode } from "@/lib/login-code";
import { canUseApp, issueMobileToken } from "@/lib/mobile-auth";
import { loadAppUser } from "@/lib/permissions";

/** Swaps a correct sign-in code for the app's long-lived token. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";

  const userId = await verifyLoginCode(email, code);
  const user = userId ? await loadAppUser(userId) : null;
  if (!user) return NextResponse.json({ error: "That code is wrong or has expired." }, { status: 400 });
  if (!canUseApp(user)) {
    return NextResponse.json({ error: "The app is for floor staff. Reception and admins use the website." }, { status: 403 });
  }

  return NextResponse.json({
    token: await issueMobileToken(user),
    user: { id: user.id, name: user.name, email: user.email },
  });
}
