"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireRoles } from "@/lib/permissions";
import type { ActionResult, FloorRole, Role } from "@/lib/types";
import { sendInvite } from "@/lib/invites";
import {
  firstIssue,
  floorInputSchema,
  inviteSchema,
  optionalPasswordSchema,
} from "@/lib/validators";

function refreshAdmin() {
  revalidatePath("/admin");
  revalidatePath("/floor/team");
  revalidatePath("/floor");
  revalidatePath("/reception");
}

export async function saveFloor(input: {
  id?: string;
  name: string;
  number: number;
  active?: boolean;
}): Promise<ActionResult> {
  await requireRoles(["SUPER_ADMIN"]);
  const parsed = floorInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    if (input.id) {
      await db.floor.update({
        where: { id: input.id },
        data: {
          name: parsed.data.name,
          number: parsed.data.number,
          active: parsed.data.active ?? true,
        },
      });
    } else {
      await db.floor.create({
        data: {
          name: parsed.data.name,
          number: parsed.data.number,
          active: true,
        },
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That floor number is already used." };
    }
    throw error;
  }

  refreshAdmin();
  return { ok: true };
}

export async function deleteFloor(floorId: string): Promise<ActionResult> {
  await requireRoles(["SUPER_ADMIN"]);
  const guests = await db.guest.count({ where: { floorId } });
  if (guests > 0) {
    return {
      ok: false,
      error: "This floor already has guests. Turn it off instead of deleting it.",
    };
  }
  await db.floor.delete({ where: { id: floorId } });
  refreshAdmin();
  return { ok: true };
}

type FloorMembershipInput = { floorId: string; role: FloorRole };

async function checkFloors(role: Role, floors: FloorMembershipInput[]) {
  const memberships = role === "FLOOR_STAFF" ? floors : [];
  if (role === "FLOOR_STAFF" && memberships.length === 0) {
    return { error: "Add them to at least one floor." } as const;
  }
  const ids = memberships.map((m) => m.floorId);
  if (new Set(ids).size !== ids.length) return { error: "A floor is listed twice." } as const;
  const found = await db.floor.count({ where: { id: { in: ids } } });
  if (found !== ids.length) return { error: "One of the floors no longer exists." } as const;
  return { memberships } as const;
}

export async function inviteUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  floors: FloorMembershipInput[];
}): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That person already has an account. Edit them in the list." };
  }

  const checked = await checkFloors(parsed.data.role, parsed.data.floors);
  if ("error" in checked) return { ok: false, error: checked.error! };

  const password = parsed.data.password;
  const created = await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: password ? await hashPassword(password) : null,
      active: true,
      floorAssignments: {
        create: checked.memberships.map((m) => ({ floorId: m.floorId, role: m.role })),
      },
    },
  });

  refreshAdmin();
  if (password) {
    return { ok: true, notice: `${parsed.data.name} can sign in with ${email} and the password you set.` };
  }
  try {
    await sendInvite({ userId: created.id, invitedBy: actor.name || "Your admin" });
  } catch (error) {
    console.error("Invite email failed", error);
    return { ok: true, notice: `${parsed.data.name} was added, but the invite email failed. Check SMTP, or set a password for them.` };
  }
  return { ok: true, notice: `Invite sent to ${email}.` };
}

export async function updateUser(input: {
  userId: string;
  name: string;
  role: Role;
  active: boolean;
  floors: FloorMembershipInput[];
  password?: string;
}): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  if (input.name.trim().length < 2) {
    return { ok: false, error: "Enter a name." };
  }
  if (input.userId === actor.id && (!input.active || input.role !== "SUPER_ADMIN")) {
    return { ok: false, error: "You cannot remove your own super admin access." };
  }
  const checked = await checkFloors(input.role, input.floors);
  if ("error" in checked) return { ok: false, error: checked.error! };

  const password = input.password?.trim() ?? "";
  const parsedPassword = optionalPasswordSchema.safeParse(password);
  if (!parsedPassword.success) {
    return { ok: false, error: firstIssue(parsedPassword.error) };
  }

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) return { ok: false, error: "Person not found." };

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        name: input.name.trim(),
        role: input.role,
        active: input.active,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    }),
    db.floorAssignment.deleteMany({ where: { userId: user.id } }),
    ...(checked.memberships.length
      ? [
          db.floorAssignment.createMany({
            data: checked.memberships.map((m) => ({ userId: user.id, floorId: m.floorId, role: m.role })),
          }),
        ]
      : []),
  ]);

  refreshAdmin();
  return { ok: true };
}

export async function resendInvite(userId: string): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Person not found." };
  try {
    await sendInvite({ userId, invitedBy: actor.name || "Your admin" });
  } catch (error) {
    console.error("Invite email failed", error);
    return { ok: false, error: "Could not send the email. Check the SMTP settings." };
  }
  return { ok: true, notice: `Invite sent to ${user.email}.` };
}

/** Turn sign-in on or off for someone. They are signed out on their next request. */
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  if (userId === actor.id) return { ok: false, error: "You can't deactivate yourself." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Person not found." };
  await db.user.update({ where: { id: userId }, data: { active } });
  refreshAdmin();
  return { ok: true, notice: `${user.name || user.email} ${active ? "can sign in again" : "is deactivated"}` };
}

/**
 * Permanently deletes an account. Their guests stay on the list; the host
 * name is kept as text.
 */
export async function deleteUser(userId: string): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  if (userId === actor.id) return { ok: false, error: "You can't remove yourself." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Person not found." };
  if (user.role === "SUPER_ADMIN") {
    const others = await db.user.count({ where: { role: "SUPER_ADMIN", active: true, id: { not: userId } } });
    if (others === 0) return { ok: false, error: "Keep at least one active super admin." };
  }
  await db.user.delete({ where: { id: userId } });
  refreshAdmin();
  return { ok: true, notice: `${user.name || user.email} removed` };
}
