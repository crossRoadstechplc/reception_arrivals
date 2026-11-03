import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { FloorTabs } from "@/components/floor/floor-tabs";
import { TeamManager } from "@/components/floor/team-manager";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Floor team" };

export default async function FloorTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string }>;
}) {
  const user = await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]);
  const params = await searchParams;

  // Floors this person can manage.
  const managed =
    user.role === "SUPER_ADMIN"
      ? await db.floor.findMany({ where: { active: true }, orderBy: { number: "asc" } })
      : user.floorAssignments
          .filter((a) => a.role === "ADMIN" && a.floor.active)
          .map((a) => a.floor)
          .sort((a, b) => a.number - b.number);

  const floor = managed.find((f) => f.id === params.floor) ?? managed[0];
  if (!floor) redirect("/floor");

  // Total floors the user can see decides whether links carry ?floor=.
  const visibleFloorCount =
    user.role === "SUPER_ADMIN" ? managed.length : user.floorAssignments.filter((a) => a.floor.active).length;

  const members = await db.floorAssignment.findMany({
    where: { floorId: floor.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          passwordHash: true,
          floorAssignments: { select: { floorId: true, floor: { select: { name: true } } } },
        },
      },
    },
  });

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "floor")} />
      <FloorTabs floorId={floor.id} current="team" multiFloor={visibleFloorCount > 1} />
      <TeamManager
        floor={{ id: floor.id, name: floor.name, number: floor.number }}
        floors={managed.map((f) => ({ id: f.id, name: f.name, number: f.number }))}
        currentUserId={user.id}
        isSuperAdmin={user.role === "SUPER_ADMIN"}
        members={members
          .map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            active: m.user.active,
            pending: !m.user.passwordHash,
            role: m.role,
            otherFloors: m.user.floorAssignments.filter((a) => a.floorId !== floor.id).map((a) => a.floor.name),
          }))
          .sort((a, b) => (a.role === b.role ? (a.name ?? "").localeCompare(b.name ?? "") : a.role === "ADMIN" ? -1 : 1))}
      />
    </main>
  );
}
