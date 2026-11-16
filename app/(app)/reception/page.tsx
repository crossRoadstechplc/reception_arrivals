import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ReceptionBoard } from "@/components/reception/reception-board";
import { db } from "@/lib/db";
import {
  formatClock,
  formatOfficeDate,
  formatTimeOfDay,
  isISODate,
  officeMinutesNow,
  officeTodayISO,
  toDateOnly,
} from "@/lib/dates";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Reception" };

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
      include: {
        floor: true,
        hostUser: { select: { name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        arrivedBy: { select: { name: true, email: true } },
      },
      orderBy: [{ floor: { number: "asc" } }, { guestName: "asc" }],
    }),
  ]);

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "reception")} />
      <ReceptionBoard
        date={date}
        today={today}
        dateLabel={formatOfficeDate(date)}
        officeMinutes={officeMinutesNow()}
        floors={floors.map((floor) => ({
          id: floor.id,
          name: floor.name,
          company: floor.company,
          number: floor.number,
        }))}
        guests={guests.map((guest) => ({
          id: guest.id,
          guestName: guest.guestName,
          company: guest.company,
          hostName: guest.hostUser?.name || guest.hostName,
          hostHasAccount: Boolean(guest.hostUserId),
          hostNotifiedVia: guest.hostNotifiedVia,
          // All time text is made here on the server so every device shows the same thing.
          expectedLabel: formatTimeOfDay(guest.expectedArrival),
          checkedInAt: (guest.arrivedAt ?? guest.clearedAt)?.toISOString() ?? null,
          checkedInLabel: guest.arrivedAt ?? guest.clearedAt ? formatClock((guest.arrivedAt ?? guest.clearedAt)!) : null,
          createdLabel: formatClock(guest.createdAt),
          notifiedLabel: guest.hostNotifiedAt ? formatClock(guest.hostNotifiedAt) : null,
          expectedArrival: guest.expectedArrival,
          status: guest.status,
          notes: guest.notes,
          floorId: guest.floorId,
          floorName: guest.floor.name,
          floorCompany: guest.floor.company,
          licensePlate: guest.licensePlate,
          vehicle: guest.vehicle,
          floorNumber: guest.floor.number,
          deskNote: guest.deskNote,
          createdByName: guest.createdBy?.name || guest.createdBy?.email || null,
          arrivedByName: guest.arrivedBy?.name || guest.arrivedBy?.email || null,
        }))}
      />
    </main>
  );
}
