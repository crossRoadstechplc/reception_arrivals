import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isISODate, officeMinutesNow, officeTodayISO, shiftISO, toDateOnly } from "@/lib/dates";
import { byExpectedTime, guestScope, loadFloorContext, toFloorGuest } from "@/lib/floor-context";
import { saveGuestAs, type SaveGuestInput } from "@/lib/guest-service";
import { withMobileUser } from "@/lib/mobile-auth";
import { canEditGuest } from "@/lib/permissions";

const MAX_DAYS = 14;

/**
 * Guests on one floor for a date range (?floor=&from=YYYY-MM-DD&to=YYYY-MM-DD).
 * Floor staff get only their own guests; floor admins get the whole floor and the host list.
 */
export async function GET(request: Request) {
  return withMobileUser(request, async (user) => {
    const url = new URL(request.url);
    const today = officeTodayISO();
    const from = isISODate(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : today;
    let to = isISODate(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : from;
    if (to < from) to = from;
    if (to > shiftISO(from, MAX_DAYS - 1)) to = shiftISO(from, MAX_DAYS - 1);

    const { floors, floorId, myRole, isAdmin, hosts } = await loadFloorContext(user, url.searchParams.get("floor") ?? undefined);
    if (!floorId) return NextResponse.json({ error: "You're not on a floor yet. Ask a super admin to add you." }, { status: 404 });

    const guests = await db.guest.findMany({
      where: { floorId, visitDate: { gte: toDateOnly(from), lte: toDateOnly(to) }, ...guestScope(user, isAdmin) },
      include: { hostUser: { select: { name: true, email: true } } },
    });

    return NextResponse.json({
      today,
      officeMinutes: officeMinutesNow(),
      from,
      to,
      floor: floors.find((f) => f.id === floorId),
      role: myRole,
      hosts: isAdmin ? hosts : [],
      guests: guests
        .map((guest) => ({
          ...toFloorGuest(guest),
          mine: guest.hostUserId === user.id,
          canEdit: canEditGuest(user, guest),
        }))
        .sort((a, b) => a.visitDate.localeCompare(b.visitDate) || byExpectedTime(a, b)),
    });
  });
}

/** Add a guest, or edit one when the body has an id. */
export async function POST(request: Request) {
  return withMobileUser(request, async (user) => {
    const body = (await request.json().catch(() => null)) as SaveGuestInput | null;
    if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    const result = await saveGuestAs(user, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
}
