import { NextResponse } from "next/server";
import { deleteGuestAs, setFloorGuestStatusAs } from "@/lib/guest-service";
import { withMobileUser } from "@/lib/mobile-auth";

type Params = { params: Promise<{ id: string }> };

/** Cancel a visit ({"status":"CANCELLED"}) or restore it ({"status":"EXPECTED"}). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withMobileUser(request, async (user) => {
    const body = (await request.json().catch(() => null)) as { status?: string } | null;
    if (body?.status !== "CANCELLED" && body?.status !== "EXPECTED") {
      return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
    }
    const result = await setFloorGuestStatusAs(user, id, body.status);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
}

/** Delete a cancelled or no-show guest for good. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  return withMobileUser(request, async (user) => {
    const result = await deleteGuestAs(user, id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
}
