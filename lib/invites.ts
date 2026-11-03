import { db } from "@/lib/db";
import { appUrl, sendInviteEmail } from "@/lib/mail";
import { newResetToken } from "@/lib/password";

const INVITE_DAYS = 7;

/**
 * Emails a "set your password" link. Reuses the password-reset token table,
 * so the same /reset-password page handles both.
 */
export async function sendInvite(input: { userId: string; invitedBy: string; floorName?: string }) {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user?.email) throw new Error("User has no email");

  const { token, tokenHash } = newResetToken();
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash, expires } });

  await sendInviteEmail({
    email: user.email,
    name: user.name,
    invitedBy: input.invitedBy,
    floorName: input.floorName,
    url: appUrl(`/reset-password?invite=1&token=${encodeURIComponent(token)}`),
  });
}
