import { NextResponse } from "next/server";
import { roomsForFormAs } from "@/lib/guest-service";
import { withMobileUser } from "@/lib/mobile-auth";

/** Meeting rooms and their taken times (?floor=&date=YYYY-MM-DD&guest=). */
export async function GET(request: Request) {
  return withMobileUser(request, async (user) => {
    const url = new URL(request.url);
    const result = await roomsForFormAs(user, {
      floorId: url.searchParams.get("floor") ?? "",
      date: url.searchParams.get("date") ?? "",
      guestId: url.searchParams.get("guest") ?? undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
}
