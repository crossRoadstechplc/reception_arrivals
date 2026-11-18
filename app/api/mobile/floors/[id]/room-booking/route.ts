import { NextResponse } from "next/server";
import { setRoomBookingAs } from "@/lib/guest-service";
import { withMobileUser } from "@/lib/mobile-auth";

type Params = { params: Promise<{ id: string }> };

/** Floor admins: switch meeting room booking on or off ({"enabled":true}). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withMobileUser(request, async (user) => {
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "Choose on or off." }, { status: 400 });
    }
    const result = await setRoomBookingAs(user, id, body.enabled);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
}
