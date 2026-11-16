import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMobileUser } from "@/lib/mobile-auth";

const schema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios"]).default("android") });

/** Register this phone for arrival alerts. A phone follows whoever last signed in on it. */
export async function POST(request: Request) {
  return withMobileUser(request, async (user) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid device token." }, { status: 400 });
    const { token, platform } = parsed.data;
    await db.deviceToken.upsert({
      where: { token },
      create: { token, platform, userId: user.id },
      update: { platform, userId: user.id },
    });
    return NextResponse.json({ ok: true });
  });
}

/** Stop alerts on this phone (sign out, or alerts turned off). */
export async function DELETE(request: Request) {
  return withMobileUser(request, async (user) => {
    const parsed = schema.pick({ token: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid device token." }, { status: 400 });
    await db.deviceToken.deleteMany({ where: { token: parsed.data.token, userId: user.id } });
    return NextResponse.json({ ok: true });
  });
}
