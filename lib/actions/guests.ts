"use server";

import { revalidatePath } from "next/cache";
import type { GuestStatus as PrismaGuestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isISODate, toDateOnly } from "@/lib/dates";
import { canAccessFloor, requireRoles, requireUser } from "@/lib/permissions";
import { notifyGuestsChanged } from "@/lib/realtime";
import type { ActionResult, GuestStatus } from "@/lib/types";
import { blankToNull, firstIssue, guestInputSchema } from "@/lib/validators";

async function refreshBoards() {
  revalidatePath("/reception");
  revalidatePath("/floor");
  try {
    await notifyGuestsChanged();
  } catch (error) {
    console.error("Reception realtime notify failed", error);
  }
}

export async function saveGuest(
  input: {
    id?: string;
    floorId: string;
    visitDate: string;
    guestName: string;
    company?: string;
    hostName: string;
    expectedArrival?: string;
    notes?: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "FLOOR_ADMIN" && user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "You cannot edit guest lists." };
  }

  const parsed = guestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!isISODate(parsed.data.visitDate)) {
    return { ok: false, error: "Choose a valid date." };
  }
  if (!canAccessFloor(user, parsed.data.floorId)) {
    return { ok: false, error: "That floor is not assigned to you." };
  }

  const floor = await db.floor.findFirst({
    where: { id: parsed.data.floorId, active: true },
  });
  if (!floor) return { ok: false, error: "That floor is not active." };

  const data = {
    floorId: parsed.data.floorId,
    visitDate: toDateOnly(parsed.data.visitDate),
    guestName: parsed.data.guestName,
    company: blankToNull(parsed.data.company),
    hostName: parsed.data.hostName,
    expectedArrival: blankToNull(parsed.data.expectedArrival),
    notes: blankToNull(parsed.data.notes),
  };

  if (input.id) {
    const existing = await db.guest.findUnique({ where: { id: input.id } });
    if (!existing || !canAccessFloor(user, existing.floorId)) {
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

export async function setFloorGuestStatus(
  guestId: string,
  status: "EXPECTED" | "CANCELLED",
): Promise<ActionResult> {
  const user = await requireRoles(["FLOOR_ADMIN", "SUPER_ADMIN"]);
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest || !canAccessFloor(user, guest.floorId)) {
    return { ok: false, error: "Guest not found." };
  }
  if (guest.status === "CLEARED") {
    return { ok: false, error: "Reception already cleared this guest." };
  }
  await db.guest.update({ where: { id: guest.id }, data: { status } });
  await refreshBoards();
  return { ok: true };
}

const receptionStatuses = new Set<GuestStatus>([
  "EXPECTED",
  "ARRIVED",
  "CLEARED",
  "NO_SHOW",
]);

export async function setReceptionStatus(
  guestId: string,
  status: GuestStatus,
): Promise<ActionResult> {
  const user = await requireRoles(["RECEPTION", "SUPER_ADMIN"]);
  if (!receptionStatuses.has(status)) {
    return { ok: false, error: "That status is not available at reception." };
  }
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest) return { ok: false, error: "Guest not found." };

  await db.guest.update({
    where: { id: guest.id },
    data: {
      status: status as PrismaGuestStatus,
      clearedAt: status === "CLEARED" ? new Date() : null,
      clearedById: status === "CLEARED" ? user.id : null,
    },
  });
  await refreshBoards();
  return { ok: true };
}
