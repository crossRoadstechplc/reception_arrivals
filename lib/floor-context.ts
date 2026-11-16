import type { Guest } from "@prisma/client";
import { db } from "@/lib/db";
import { formatClock, formatTimeOfDay, fromDateOnly } from "@/lib/dates";
import { floorRoleOf, type AppUser } from "@/lib/permissions";
import { floorLabel, type FloorRole } from "@/lib/types";

export type FloorChoice = { id: string; name: string; number: number; role: FloorRole };

/**
 * The floors a person works on, the one they're looking at, their role there,
 * and (for floor admins) who they can pick as a guest's host.
 * Shared by the floor guest list and the floor calendar.
 */
export async function loadFloorContext(user: AppUser, requestedFloorId?: string) {
  const floors: FloorChoice[] =
    user.role === "SUPER_ADMIN"
      ? (await db.floor.findMany({ where: { active: true }, orderBy: { number: "asc" } })).map((floor) => ({
          id: floor.id,
          name: floorLabel(floor),
          number: floor.number,
          role: "ADMIN" as const,
        }))
      : user.floorAssignments
          .filter((assignment) => assignment.floor.active)
          .sort((a, b) => a.floor.number - b.floor.number)
          .map((assignment) => ({
            id: assignment.floor.id,
            name: floorLabel(assignment.floor),
            number: assignment.floor.number,
            role: assignment.role,
          }));

  const floorId = floors.find((floor) => floor.id === requestedFloorId)?.id ?? floors[0]?.id ?? null;
  const myRole = floorId ? floorRoleOf(user, floorId) : null;
  const isAdmin = myRole === "ADMIN";

  const team =
    floorId && isAdmin
      ? await db.floorAssignment.findMany({
          where: { floorId, user: { active: true } },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : [];

  // People an admin can pick as host: everyone on the floor, plus themselves.
  const hostMap = new Map(team.map((m) => [m.user.id, m.user.name || m.user.email || "Unnamed"]));
  if (isAdmin && !hostMap.has(user.id)) hostMap.set(user.id, user.name || user.email || "Me");
  const hosts = [...hostMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  return { floors, floorId, myRole, isAdmin, hosts };
}

/** Members only see the guests they host or added; admins see the whole floor. */
export function guestScope(user: AppUser, isAdmin: boolean) {
  return isAdmin ? {} : { OR: [{ hostUserId: user.id }, { createdById: user.id }] };
}

type GuestWithHost = Guest & { hostUser: { name: string | null; email: string | null } | null };

/** What the floor screens need about a guest. Time text is made here so every device shows the same thing. */
export function toFloorGuest(guest: GuestWithHost) {
  const checkedIn = guest.arrivedAt ?? guest.clearedAt;
  return {
    id: guest.id,
    visitDate: fromDateOnly(guest.visitDate),
    guestName: guest.guestName,
    company: guest.company,
    hostName: guest.hostUser?.name || guest.hostName,
    hostUserId: guest.hostUserId,
    expectedArrival: guest.expectedArrival,
    status: guest.status,
    notes: guest.notes,
    licensePlate: guest.licensePlate,
    vehicle: guest.vehicle,
    expectedLabel: formatTimeOfDay(guest.expectedArrival),
    checkedInLabel: checkedIn ? formatClock(checkedIn) : null,
  };
}

export const byExpectedTime = (
  a: { expectedArrival: string | null; guestName: string },
  b: { expectedArrival: string | null; guestName: string },
) => (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") || a.guestName.localeCompare(b.guestName);
