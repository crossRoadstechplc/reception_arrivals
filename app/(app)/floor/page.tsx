import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { FloorTabs } from "@/components/floor/floor-tabs";
import { GuestManager } from "@/components/floor/guest-manager";
import { db } from "@/lib/db";
import { isISODate, officeTimeZone, officeTodayISO, toDateOnly } from "@/lib/dates";
import { floorRoleOf, requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";
import type { FloorRole } from "@/lib/types";

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

  const floors: { id: string; name: string; number: number; role: FloorRole }[] =
    user.role === "SUPER_ADMIN"
      ? (await db.floor.findMany({ where: { active: true }, orderBy: { number: "asc" } })).map((floor) => ({
          id: floor.id,
          name: floor.name,
          number: floor.number,
          role: "ADMIN" as const,
        }))
      : user.floorAssignments
          .filter((assignment) => assignment.floor.active)
          .sort((a, b) => a.floor.number - b.floor.number)
          .map((assignment) => ({
            id: assignment.floor.id,
            name: assignment.floor.name,
            number: assignment.floor.number,
            role: assignment.role,
          }));

  const floorId = floors.find((floor) => floor.id === params.floor)?.id ?? floors[0]?.id ?? null;
  const myRole = floorId ? floorRoleOf(user, floorId) : null;
  const isAdmin = myRole === "ADMIN";

  const [guests, team] = floorId
    ? await Promise.all([
        db.guest.findMany({
          where: {
            floorId,
            visitDate: toDateOnly(date),
            // Members only see the guests they host or added.
            ...(isAdmin ? {} : { OR: [{ hostUserId: user.id }, { createdById: user.id }] }),
          },
          include: { hostUser: { select: { name: true, email: true } } },
        }),
        isAdmin
          ? db.floorAssignment.findMany({
              where: { floorId, user: { active: true } },
              include: { user: { select: { id: true, name: true, email: true } } },
            })
          : Promise.resolve([]),
      ])
    : [[], []];

  const sorted = guests
    .slice()
    .sort(
      (a, b) =>
        (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") ||
        a.guestName.localeCompare(b.guestName),
    );

  // People an admin can pick as host: everyone on the floor, plus themselves.
  const hostMap = new Map(team.map((m) => [m.user.id, m.user.name || m.user.email || "Unnamed"]));
  if (isAdmin && !hostMap.has(user.id)) hostMap.set(user.id, user.name || user.email || "Me");
  const hosts = [...hostMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "floor")} />
      {floorId && isAdmin ? <FloorTabs floorId={floorId} current="guests" multiFloor={floors.length > 1} /> : null}
      <GuestManager
        date={date}
        today={today}
        timeZone={officeTimeZone()}
        floorId={floorId}
        floors={floors}
        myRole={myRole}
        currentUserId={user.id}
        hosts={hosts}
        guests={sorted.map((guest) => ({
          id: guest.id,
          guestName: guest.guestName,
          company: guest.company,
          hostName: guest.hostUser?.name || guest.hostName,
          hostUserId: guest.hostUserId,
          expectedArrival: guest.expectedArrival,
          status: guest.status,
          notes: guest.notes,
          arrivedAt: guest.arrivedAt ? guest.arrivedAt.toISOString() : null,
          clearedAt: guest.clearedAt ? guest.clearedAt.toISOString() : null,
        }))}
      />
    </main>
  );
}
