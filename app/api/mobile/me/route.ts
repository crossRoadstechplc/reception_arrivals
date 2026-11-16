import { NextResponse } from "next/server";
import { officeTodayISO } from "@/lib/dates";
import { loadFloorContext } from "@/lib/floor-context";
import { fcmConfigured } from "@/lib/fcm";
import { withMobileUser } from "@/lib/mobile-auth";

/** Who is signed in and which floors they work on. */
export async function GET(request: Request) {
  return withMobileUser(request, async (user) => {
    const { floors } = await loadFloorContext(user);
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      floors,
      today: officeTodayISO(),
      alertsAvailable: fcmConfigured(),
    });
  });
}
