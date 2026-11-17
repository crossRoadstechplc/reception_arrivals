import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { FloorTabs } from "@/components/floor/floor-tabs";
import { GuestManager } from "@/components/floor/guest-manager";
import { db } from "@/lib/db";
import { formatOfficeDate, isISODate, officeTodayISO, toDateOnly } from "@/lib/dates";
import { byExpectedTime, floorGuestInclude, guestScope, loadFloorContext, toFloorGuest } from "@/lib/floor-context";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Guests" };

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; floor?: string }>;
}) {
  const user = await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]);
  const params = await searchParams;
  const today = officeTodayISO();
  const date = params.date && isISODate(params.date) ? params.date : today;

  const { floors, floorId, myRole, isAdmin, hosts, people } = await loadFloorContext(user, params.floor);

  const guests = floorId
    ? await db.guest.findMany({
        where: { floorId, visitDate: toDateOnly(date), ...guestScope(user, isAdmin) },
        include: floorGuestInclude,
      })
    : [];

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "floor")} />
      {floorId ? (
        <FloorTabs floorId={floorId} current="guests" multiFloor={floors.length > 1} showTeam={isAdmin} date={params.date} />
      ) : null}
      <GuestManager
        date={date}
        today={today}
        dateLabel={formatOfficeDate(date)}
        floorId={floorId}
        floors={floors}
        myRole={myRole}
        currentUserId={user.id}
        hosts={hosts}
        people={people}
        guests={guests.map((g) => toFloorGuest(g, user)).sort(byExpectedTime)}
      />
    </main>
  );
}
