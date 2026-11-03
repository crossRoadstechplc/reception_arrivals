import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ReceptionBoard } from "@/components/reception/reception-board";
import { db } from "@/lib/db";
import { isISODate, officeTimeZone, officeTodayISO, toDateOnly } from "@/lib/dates";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Board" };

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRoles(["RECEPTION", "SUPER_ADMIN"]);
  const params = await searchParams;
  const today = officeTodayISO();
  const date = params.date && isISODate(params.date) ? params.date : today;

  const [floors, guests] = await Promise.all([
    db.floor.findMany({ where: { active: true }, orderBy: { number: "asc" } }),
    db.guest.findMany({
      where: { visitDate: toDateOnly(date), floor: { active: true } },
      include: { floor: true, hostUser: { select: { name: true, email: true } } },
      orderBy: [{ floor: { number: "asc" } }, { guestName: "asc" }],
    }),
  ]);

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "reception")} />
      <ReceptionBoard
        date={date}
        today={today}
        timeZone={officeTimeZone()}
        floors={floors.map((floor) => ({
          id: floor.id,
          name: floor.name,
          number: floor.number,
        }))}
        guests={guests.map((guest) => ({
          id: guest.id,
          guestName: guest.guestName,
          company: guest.company,
          hostName: guest.hostUser?.name || guest.hostName,
          hostHasAccount: Boolean(guest.hostUserId),
          hostNotifiedVia: guest.hostNotifiedVia,
          arrivedAt: guest.arrivedAt ? guest.arrivedAt.toISOString() : null,
          expectedArrival: guest.expectedArrival,
          status: guest.status,
          notes: guest.notes,
          clearedAt: guest.clearedAt ? guest.clearedAt.toISOString() : null,
          floorId: guest.floorId,
          floorName: guest.floor.name,
          floorNumber: guest.floor.number,
        }))}
      />
    </main>
  );
}
