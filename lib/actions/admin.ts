"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireRoles } from "@/lib/permissions";
import type { ActionResult, Role } from "@/lib/types";
import {
  firstIssue,
  floorInputSchema,
  inviteSchema,
  optionalPasswordSchema,
} from "@/lib/validators";

function refreshAdmin() {
  revalidatePath("/admin");
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

export async function inviteUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  floorIds: string[];
}): Promise<ActionResult> {
  await requireRoles(["SUPER_ADMIN"]);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That person is already on the desk. Edit them below." };
  }

  const floorIds = parsed.data.role === "FLOOR_ADMIN" ? parsed.data.floorIds : [];
  if (parsed.data.role === "FLOOR_ADMIN" && floorIds.length === 0) {
    return { ok: false, error: "Assign at least one floor." };
  }

  const floors = await db.floor.findMany({ where: { id: { in: floorIds } } });
  if (floors.length !== floorIds.length) {
    return { ok: false, error: "One of the floors no longer exists." };
  }

  await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      active: true,
      floorAssignments: {
        create: floorIds.map((floorId) => ({ floorId })),
      },
    },
  });

  refreshAdmin();
  return {
    ok: true,
    notice: `${parsed.data.name} can sign in with ${email} and the password you set.`,
  };
}

export async function updateUser(input: {
  userId: string;
  name: string;
  role: Role;
  active: boolean;
  floorIds: string[];
  password?: string;
}): Promise<ActionResult> {
  const actor = await requireRoles(["SUPER_ADMIN"]);
  if (input.name.trim().length < 2) {
    return { ok: false, error: "Enter a name." };
  }
  if (input.userId === actor.id && (!input.active || input.role !== "SUPER_ADMIN")) {
    return { ok: false, error: "You cannot remove your own super admin access." };
  }
  const floorIds = input.role === "FLOOR_ADMIN" ? input.floorIds : [];
  if (input.role === "FLOOR_ADMIN" && floorIds.length === 0) {
    return { ok: false, error: "Assign at least one floor." };
  }

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
    ...(floorIds.length
      ? [
          db.floorAssignment.createMany({
            data: floorIds.map((floorId) => ({ userId: user.id, floorId })),
          }),
        ]
      : []),
  ]);

  refreshAdmin();
  return { ok: true };
}
