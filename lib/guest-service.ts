import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isISODate, toDateOnly } from "@/lib/dates";
import { canEditGuest, floorRoleOf, type AppUser } from "@/lib/permissions";
import { notifyGuestsChanged } from "@/lib/realtime";
import { OTHER_HOST, type ActionResult } from "@/lib/types";
import { blankToNull, firstIssue, guestInputSchema } from "@/lib/validators";

/**
 * Floor-side guest rules, shared by the website's server actions and the
 * mobile app's API so both behave exactly the same.
 */

export type SaveGuestInput = {
  id?: string;
  floorId: string;
  visitDate: string;
  guestName: string;
  company?: string;
  hostUserId?: string;
  hostName?: string;
  expectedArrival?: string;
  notes?: string;
  licensePlate?: string;
  vehicle?: string;
};

export async function refreshBoards() {
  revalidatePath("/reception");
  revalidatePath("/floor");
  try {
    await notifyGuestsChanged();
  } catch (error) {
    console.error("Reception realtime notify failed", error);
  }
}

export async function saveGuestAs(user: AppUser, input: SaveGuestInput): Promise<ActionResult> {
  if (user.role !== "FLOOR_STAFF" && user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "You cannot edit guest lists." };
  }

  const parsed = guestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!isISODate(parsed.data.visitDate)) {
    return { ok: false, error: "Choose a valid date." };
  }

  const floorRole = floorRoleOf(user, parsed.data.floorId);
  if (!floorRole) return { ok: false, error: "You are not on that floor." };

  const floor = await db.floor.findFirst({ where: { id: parsed.data.floorId, active: true } });
  if (!floor) return { ok: false, error: "That floor is not active." };

  // Work out who the host is.
  let hostUserId: string | null;
  let hostName: string;
  if (floorRole === "MEMBER") {
    // Members only ever add their own guests.
    hostUserId = user.id;
    hostName = user.name || user.email || "Host";
  } else if (parsed.data.hostUserId && parsed.data.hostUserId !== OTHER_HOST) {
    const host =
      parsed.data.hostUserId === user.id
        ? user
        : (
            await db.floorAssignment.findUnique({
              where: { userId_floorId: { userId: parsed.data.hostUserId, floorId: floor.id } },
              include: { user: true },
            })
          )?.user;
    if (!host?.active) return { ok: false, error: "That host is not on this floor." };
    hostUserId = host.id;
    hostName = host.name || host.email || "Host";
  } else {
    const typed = parsed.data.hostName?.trim() ?? "";
    if (typed.length < 2) return { ok: false, error: "Enter the host's name." };
    hostUserId = null;
    hostName = typed;
  }

  const data = {
    floorId: floor.id,
    visitDate: toDateOnly(parsed.data.visitDate),
    guestName: parsed.data.guestName,
    company: blankToNull(parsed.data.company),
    hostUserId,
    hostName,
    expectedArrival: blankToNull(parsed.data.expectedArrival),
    notes: blankToNull(parsed.data.notes),
    // Plates are stored in capitals so they read the same on every screen.
    licensePlate: blankToNull(parsed.data.licensePlate?.toUpperCase().replace(/\s+/g, " ")),
    vehicle: blankToNull(parsed.data.vehicle),
  };

  if (input.id) {
    const existing = await db.guest.findUnique({ where: { id: input.id } });
    if (!existing || !canEditGuest(user, existing)) {
      return { ok: false, error: "Guest not found." };
    }
    if (existing.status === "CLEARED") {
      return { ok: false, error: "Reception already cleared this guest." };
    }
    await db.guest.update({ where: { id: existing.id }, data });
  } else {
    await db.guest.create({
      data: { ...data, createdById: user.id, status: "EXPECTED" },
    });
  }

  await refreshBoards();
  return { ok: true };
}

export async function setFloorGuestStatusAs(
  user: AppUser,
  guestId: string,
  status: "EXPECTED" | "CANCELLED",
): Promise<ActionResult> {
  if (user.role !== "FLOOR_STAFF" && user.role !== "SUPER_ADMIN") return { ok: false, error: "You cannot edit guest lists." };
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest || !canEditGuest(user, guest)) {
    return { ok: false, error: "Guest not found." };
  }
  if (guest.status === "CLEARED") {
    return { ok: false, error: "Reception already cleared this guest." };
  }
  await db.guest.update({ where: { id: guest.id }, data: { status } });
  await refreshBoards();
  return { ok: true };
}

/** Permanently removes a cancelled or no-show guest. Cleared guests stay as a record. */
export async function deleteGuestAs(user: AppUser, guestId: string): Promise<ActionResult> {
  if (user.role !== "FLOOR_STAFF" && user.role !== "SUPER_ADMIN") return { ok: false, error: "You cannot edit guest lists." };
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest || !canEditGuest(user, guest)) {
    return { ok: false, error: "Guest not found." };
  }
  if (guest.status !== "CANCELLED" && guest.status !== "NO_SHOW") {
    return { ok: false, error: "Cancel the visit first, then delete it." };
  }
  await db.guest.delete({ where: { id: guest.id } });
  await refreshBoards();
  return { ok: true };
}
