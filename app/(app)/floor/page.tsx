import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { GuestManager } from "@/components/floor/guest-manager";
import { db } from "@/lib/db";
import { isISODate, officeTimeZone, officeTodayISO, toDateOnly } from "@/lib/dates";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Guests" };

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; floor?: string }>;
}) {
  const user = await requireRoles(["FLOOR_ADMIN", "SUPER_ADMIN"]);
  const params = await searchParams;
  const today = officeTodayISO();
  const date = params.date && isISODate(params.date) ? params.date : today;

  const floors =
    user.role === "SUPER_ADMIN"
      ? await db.floor.findMany({ where: { active: true }, orderBy: { number: "asc" } })
      : user.floorAssignments
          .map((assignment) => assignment.floor)
          .filter((floor) => floor.active)
          .sort((a, b) => a.number - b.number);

  const requested = params.floor;
  const floorId =
    floors.find((floor) => floor.id === requested)?.id ?? floors[0]?.id ?? null;

  const guests = floorId
    ? (
        await db.guest.findMany({
          where: { floorId, visitDate: toDateOnly(date) },
        })
      )
        .slice()
        .sort(
          (a, b) =>
            (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") ||
            a.guestName.localeCompare(b.guestName),
        )
    : [];

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "floor")} />
      <GuestManager
        date={date}
        today={today}
        timeZone={officeTimeZone()}
        floorId={floorId}
        canPickFloor={user.role === "SUPER_ADMIN" || floors.length > 1}
        floors={floors.map((floor) => ({
          id: floor.id,
          name: floor.name,
          number: floor.number,
        }))}
        guests={guests.map((guest) => ({
          id: guest.id,
          guestName: guest.guestName,
          company: guest.company,
          hostName: guest.hostName,
          expectedArrival: guest.expectedArrival,
          status: guest.status,
          notes: guest.notes,
          clearedAt: guest.clearedAt ? guest.clearedAt.toISOString() : null,
        }))}
      />
    </main>
  );
}
