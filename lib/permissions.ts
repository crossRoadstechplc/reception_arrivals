import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homePath } from "@/lib/roles";
import type { FloorRole, Role } from "@/lib/types";

const userInclude = {
  floorAssignments: { include: { floor: true } },
} satisfies Prisma.UserInclude;

export type AppUser = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    include: userInclude,
  });
  if (!user?.active) return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRoles(roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePath(user.role));
  return user;
}

/** The user's role on a floor, or null if they are not on it. Super admins act as admins everywhere. */
export function floorRoleOf(user: AppUser, floorId: string): FloorRole | null {
  if (user.role === "SUPER_ADMIN") return "ADMIN";
  if (user.role !== "FLOOR_STAFF") return null;
  return user.floorAssignments.find((a) => a.floorId === floorId)?.role ?? null;
}

/** Can see the floor at all (admin or member). */
export function canAccessFloor(user: AppUser, floorId: string) {
  return floorRoleOf(user, floorId) !== null;
}

/** Can see every guest on the floor and manage its team. */
export function canManageFloor(user: AppUser, floorId: string) {
  return floorRoleOf(user, floorId) === "ADMIN";
}

/** Can edit or cancel this particular guest. */
export function canEditGuest(
  user: AppUser,
  guest: { floorId: string; hostUserId: string | null; createdById: string | null },
) {
  const role = floorRoleOf(user, guest.floorId);
  if (role === "ADMIN") return true;
  if (role === "MEMBER") return guest.hostUserId === user.id || guest.createdById === user.id;
  return false;
}
