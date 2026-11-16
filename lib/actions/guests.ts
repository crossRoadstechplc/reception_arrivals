"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { GuestStatus as PrismaGuestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteGuestAs, refreshBoards, saveGuestAs, setFloorGuestStatusAs, type SaveGuestInput } from "@/lib/guest-service";
import { notifyHostOfArrival } from "@/lib/notify";
import { requireRoles, requireUser } from "@/lib/permissions";
import { notifyGuestsChanged } from "@/lib/realtime";
import type { ActionResult, GuestStatus } from "@/lib/types";

export async function saveGuest(input: SaveGuestInput): Promise<ActionResult> {
  return saveGuestAs(await requireUser(), input);
}

export async function setFloorGuestStatus(guestId: string, status: "EXPECTED" | "CANCELLED"): Promise<ActionResult> {
  return setFloorGuestStatusAs(await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]), guestId, status);
}

/** Permanently removes a cancelled or no-show guest. Cleared guests stay as a record. */
export async function deleteGuest(guestId: string): Promise<ActionResult> {
  return deleteGuestAs(await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]), guestId);
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

/** Saves reception's private note on a visit. Floor staff never see it. */
export async function setDeskNote(guestId: string, note: string): Promise<ActionResult> {
  await requireRoles(["RECEPTION", "SUPER_ADMIN"]);
  const trimmed = note.trim();
  if (trimmed.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  const guest = await db.guest.findUnique({ where: { id: guestId }, select: { id: true } });
  if (!guest) return { ok: false, error: "Guest not found." };
  await db.guest.update({ where: { id: guest.id }, data: { deskNote: trimmed || null } });
  revalidatePath("/reception");
  return { ok: true };
}
