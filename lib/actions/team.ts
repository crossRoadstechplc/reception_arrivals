"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendInvite } from "@/lib/invites";
import { canManageFloor, requireRoles } from "@/lib/permissions";
import { ROLE_LABEL, type ActionResult, type FloorRole } from "@/lib/types";
import { firstIssue, teamMemberSchema } from "@/lib/validators";

function refreshTeam() {
  revalidatePath("/floor");
  revalidatePath("/floor/team");
  revalidatePath("/admin");
}

async function requireFloorManager(floorId: string) {
  const user = await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]);
  if (!canManageFloor(user, floorId)) return { user, floor: null };
  const floor = await db.floor.findUnique({ where: { id: floorId } });
  return { user, floor };
}

/**
 * Adds someone to a floor as a member. If the email already has an account
 * (for example a member of another floor), that same account joins this floor.
 */
export async function addTeamMember(input: { floorId: string; email: string; name?: string }): Promise<ActionResult> {
  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { user, floor } = await requireFloorManager(parsed.data.floorId);
  if (!floor) return { ok: false, error: "You don't manage this floor." };

  const email = parsed.data.email.toLowerCase();
  const name = parsed.data.name?.trim() ?? "";
  const existing = await db.user.findUnique({
    where: { email },
    include: { floorAssignments: true },
  });

  if (existing) {
    if (existing.role !== "FLOOR_STAFF") {
      return {
        ok: false,
        error: `${email} is a ${ROLE_LABEL[existing.role].toLowerCase()} account and can't join a floor team.`,
      };
    }
    if (!existing.active) {
      return { ok: false, error: "That account is turned off. Ask a super admin to turn it back on." };
    }
    if (existing.floorAssignments.some((a) => a.floorId === floor.id)) {
      return { ok: false, error: `${existing.name || email} is already on ${floor.name}.` };
    }
    await db.floorAssignment.create({ data: { userId: existing.id, floorId: floor.id, role: "MEMBER" } });
    refreshTeam();
    return {
      ok: true,
      notice: `${existing.name || email} added to ${floor.name}. They already have an account, so they use the same sign-in.`,
    };
  }

  if (name.length < 2) return { ok: false, error: "Enter their name. This email is new to Arrival Desk." };

  const created = await db.user.create({
    data: {
      email,
      name,
      role: "FLOOR_STAFF",
      active: true,
      floorAssignments: { create: { floorId: floor.id, role: "MEMBER" } },
    },
  });

  try {
    await sendInvite({ userId: created.id, invitedBy: user.name || user.email || "Your floor admin", floorName: floor.name });
  } catch (error) {
    console.error("Invite email failed", error);
    refreshTeam();
    return {
      ok: true,
      notice: `${name} was added, but the invite email could not be sent. Check SMTP, then use "Resend invite".`,
    };
  }

  refreshTeam();
  return { ok: true, notice: `Invite sent to ${email}.` };
}

export async function removeTeamMember(input: { floorId: string; userId: string }): Promise<ActionResult> {
  const { user, floor } = await requireFloorManager(input.floorId);
  if (!floor) return { ok: false, error: "You don't manage this floor." };
  if (input.userId === user.id) return { ok: false, error: "You can't remove yourself from the floor." };

  const membership = await db.floorAssignment.findUnique({
    where: { userId_floorId: { userId: input.userId, floorId: floor.id } },
  });
  if (!membership) return { ok: false, error: "That person is not on this floor." };
  if (membership.role === "ADMIN" && user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "Only a super admin can remove a floor admin." };
  }

  await db.floorAssignment.delete({ where: { userId_floorId: { userId: input.userId, floorId: floor.id } } });
  refreshTeam();
  return { ok: true };
}

export async function resendTeamInvite(input: { floorId: string; userId: string }): Promise<ActionResult> {
  const { user, floor } = await requireFloorManager(input.floorId);
  if (!floor) return { ok: false, error: "You don't manage this floor." };

  const membership = await db.floorAssignment.findUnique({
    where: { userId_floorId: { userId: input.userId, floorId: floor.id } },
    include: { user: true },
  });
  if (!membership) return { ok: false, error: "That person is not on this floor." };
  if (membership.user.passwordHash) return { ok: false, error: "They already set a password." };

  try {
    await sendInvite({ userId: input.userId, invitedBy: user.name || user.email || "Your floor admin", floorName: floor.name });
  } catch (error) {
    console.error("Invite email failed", error);
    return { ok: false, error: "Could not send the email. Check the SMTP settings." };
  }
  return { ok: true, notice: `Invite sent again to ${membership.user.email}.` };
}

/** Promote or demote someone on a floor. Super admins only. */
export async function setTeamRole(input: { floorId: string; userId: string; role: FloorRole }): Promise<ActionResult> {
  await requireRoles(["SUPER_ADMIN"]);
  const membership = await db.floorAssignment.findUnique({
    where: { userId_floorId: { userId: input.userId, floorId: input.floorId } },
  });
  if (!membership) return { ok: false, error: "That person is not on this floor." };
  await db.floorAssignment.update({
    where: { userId_floorId: { userId: input.userId, floorId: input.floorId } },
    data: { role: input.role },
  });
  refreshTeam();
  return { ok: true };
}
