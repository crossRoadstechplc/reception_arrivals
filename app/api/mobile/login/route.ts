import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canUseApp, issueMobileToken } from "@/lib/mobile-auth";
import { verifyPassword } from "@/lib/password";
import { loadAppUser } from "@/lib/permissions";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const record = await db.user.findUnique({ where: { email: parsed.data.email } });
  const matches = record?.passwordHash ? await verifyPassword(parsed.data.password, record.passwordHash) : false;
  const user = matches && record ? await loadAppUser(record.id) : null;
  if (!user) return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  if (!canUseApp(user)) {
    return NextResponse.json({ error: "The app is for floor staff. Reception and admins use the website." }, { status: 403 });
  }

  return NextResponse.json({
    token: await issueMobileToken(user),
    user: { id: user.id, name: user.name, email: user.email },
  });
}
