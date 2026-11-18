import type { Guest } from "@prisma/client";
import { db } from "@/lib/db";
import { formatClock, formatTimeOfDay, fromDateOnly } from "@/lib/dates";
import { canEditGuest, floorRoleOf, type AppUser } from "@/lib/permissions";
import { guestBookingView, roomBookingAvailable, roomBookingOn } from "@/lib/room-booking";
import { floorLabel, type FloorRole } from "@/lib/types";

export type FloorChoice = {
  id: string;
  name: string;
  number: number;
  role: FloorRole;
  /** The floor is connected to a booking system, so its admin can switch booking on. */
  roomBookingAvailable: boolean;
  /** Booking is switched on: the guest form offers a meeting room. */
  roomBookingOn: boolean;
};

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
          roomBookingAvailable: roomBookingAvailable(floor),
          roomBookingOn: roomBookingOn(floor),
        }))
      : user.floorAssignments
          .filter((assignment) => assignment.floor.active)
          .sort((a, b) => a.floor.number - b.floor.number)
          .map((assignment) => ({
            id: assignment.floor.id,
            name: floorLabel(assignment.floor),
            number: assignment.floor.number,
            role: assignment.role,
            roomBookingAvailable: roomBookingAvailable(assignment.floor),
            roomBookingOn: roomBookingOn(assignment.floor),
          }));

  const floorId = floors.find((floor) => floor.id === requestedFloorId)?.id ?? floors[0]?.id ?? null;
  const myRole = floorId ? floorRoleOf(user, floorId) : null;
  const isAdmin = myRole === "ADMIN";

  const team = floorId
    ? await db.floorAssignment.findMany({
        where: { floorId, user: { active: true } },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
    : [];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  // Everyone on the floor: who can be picked for "Also notify".
  const people = team.map((m) => ({ id: m.user.id, name: m.user.name || m.user.email || "Unnamed" })).sort(byName);

  // People an admin can pick as host: everyone on the floor, plus themselves.
  const hostMap = new Map(isAdmin ? people.map((p) => [p.id, p.name]) : []);
  if (isAdmin && !hostMap.has(user.id)) hostMap.set(user.id, user.name || user.email || "Me");
  const hosts = [...hostMap].map(([id, name]) => ({ id, name })).sort(byName);

  return { floors, floorId, myRole, isAdmin, hosts, people };
}

/**
 * Floor staff see the guests they host, added, or were invited to ("Also notify");
 * floor admins see the whole floor.
 */
export function guestScope(user: AppUser, isAdmin: boolean) {
  return isAdmin
    ? {}
    : { OR: [{ hostUserId: user.id }, { createdById: user.id }, { invitees: { some: { userId: user.id } } }] };
}

/** Everything toFloorGuest needs; pass to findMany's `include`. */
export const floorGuestInclude = {
  hostUser: { select: { name: true, email: true } },
  invitees: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
} as const;

type FloorGuestRecord = Guest & {
  hostUser: { name: string | null; email: string | null } | null;
  invitees: { userId: string; notifiedVia: string | null; user: { id: string; name: string | null; email: string | null } }[];
};

/** What the floor screens need about a guest. Time text is made here so every device shows the same thing. */
export function toFloorGuest(guest: FloorGuestRecord, viewer: AppUser) {
  const checkedIn = guest.arrivedAt ?? guest.clearedAt;
  const canEdit = canEditGuest(viewer, guest);
  return {
    /** Who else is told about this visit ("Also notify"). */
    notifyUsers: guest.invitees.map((i) => ({ id: i.userId, name: i.user.name || i.user.email || "Unnamed" })),
    /** The viewer only sees this because they're on the "Also notify" list. */
    invited: !canEdit && guest.invitees.some((i) => i.userId === viewer.id),
    mine: guest.hostUserId === viewer.id,
    canEdit,
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
    /** The meeting room for this visit, if one was asked for. */
    booking: guestBookingView(guest),
    expectedLabel: formatTimeOfDay(guest.expectedArrival),
    checkedInLabel: checkedIn ? formatClock(checkedIn) : null,
  };
}

export const byExpectedTime = (
  a: { expectedArrival: string | null; guestName: string },
  b: { expectedArrival: string | null; guestName: string },
) => (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") || a.guestName.localeCompare(b.guestName);
