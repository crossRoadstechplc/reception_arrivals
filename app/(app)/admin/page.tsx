import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/admin-console";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireRoles(["SUPER_ADMIN"]);
  const [floors, users] = await Promise.all([
    db.floor.findMany({
      orderBy: { number: "asc" },
      include: { _count: { select: { guests: true, assignments: true } } },
    }),
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { floorAssignments: true },
    }),
  ]);

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "admin")} />
      <AdminConsole
        currentUserId={user.id}
        floors={floors.map((floor) => ({
          id: floor.id,
          name: floor.name,
          number: floor.number,
          active: floor.active,
          guestCount: floor._count.guests,
          adminCount: floor._count.assignments,
        }))}
        users={users.map((person) => ({
          id: person.id,
          name: person.name,
          email: person.email,
          role: person.role,
          active: person.active,
          floorIds: person.floorAssignments.map((assignment) => assignment.floorId),
        }))}
      />
    </main>
  );
}
