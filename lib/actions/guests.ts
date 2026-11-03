"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { GuestStatus as PrismaGuestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isISODate, toDateOnly } from "@/lib/dates";
import { notifyHostOfArrival } from "@/lib/notify";
import { canEditGuest, floorRoleOf, requireRoles, requireUser } from "@/lib/permissions";
import { notifyGuestsChanged } from "@/lib/realtime";
import { OTHER_HOST, type ActionResult, type GuestStatus } from "@/lib/types";
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

export async function saveGuest(input: {
  id?: string;
  floorId: string;
  visitDate: string;
  guestName: string;
  company?: string;
  hostUserId?: string;
  hostName?: string;
  expectedArrival?: string;
  notes?: string;
}): Promise<ActionResult> {
  const user = await requireUser();
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

export async function setFloorGuestStatus(
  guestId: string,
  status: "EXPECTED" | "CANCELLED",
): Promise<ActionResult> {
  const user = await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]);
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

const receptionStatuses = new Set<GuestStatus>(["EXPECTED", "ARRIVED", "CLEARED", "NO_SHOW"]);

export async function setReceptionStatus(guestId: string, status: GuestStatus): Promise<ActionResult> {
  const user = await requireRoles(["RECEPTION", "SUPER_ADMIN"]);
  if (!receptionStatuses.has(status)) {
    return { ok: false, error: "That status is not available at reception." };
  }
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest) return { ok: false, error: "Guest not found." };

  const now = new Date();
  const here = status === "ARRIVED" || status === "CLEARED";

  await db.guest.update({
    where: { id: guest.id },
    data: {
      status: status as PrismaGuestStatus,
      // Record who checked the guest in, once.
      arrivedAt: here ? (guest.arrivedAt ?? now) : null,
      arrivedById: here ? (guest.arrivedById ?? user.id) : null,
      clearedAt: status === "CLEARED" ? now : null,
      clearedById: status === "CLEARED" ? user.id : null,
      // Going back to "expected" or "no-show" means a later arrival should alert the host again.
      ...(here ? {} : { hostNotifiedAt: null, hostNotifiedVia: null }),
    },
  });
  await refreshBoards();

  if (here && guest.hostUserId && !guest.hostNotifiedAt) {
    // Send the alert after responding so reception isn't kept waiting.
    after(async () => {
      await notifyHostOfArrival(guest.id);
      // Pages are dynamic, so a live refresh is enough to show "host notified".
      await notifyGuestsChanged().catch((error) => console.error("Realtime notify failed", error));
    });
  }
  return { ok: true };
}
