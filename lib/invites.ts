import { db } from "@/lib/db";
import { appUrl, sendInviteEmail } from "@/lib/mail";

/** Emails a link to the sign-in page, where they get a code by email. No password to set. */
export async function sendInvite(input: { userId: string; invitedBy: string; floorName?: string }) {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user?.email) throw new Error("User has no email");

  await sendInviteEmail({
    email: user.email,
    name: user.name,
    invitedBy: input.invitedBy,
    floorName: input.floorName,
    url: appUrl(`/login?email=${encodeURIComponent(user.email)}`),
  });
}
