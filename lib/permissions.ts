import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homePath } from "@/lib/roles";
import type { Role } from "@/lib/types";

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

export function canAccessFloor(user: AppUser, floorId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "FLOOR_ADMIN") return false;
  return user.floorAssignments.some((assignment) => assignment.floorId === floorId);
}
