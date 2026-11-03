import { db } from "@/lib/db";
import { guestArrivedMessage, sendGuestArrivedEmail, smtpConfigured } from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";

/**
 * Tells a guest's host that the guest is at reception, by browser push and
 * email together. Runs once per arrival (hostNotifiedAt).
 * Never throws; a failed alert must not block reception.
 */
export async function notifyHostOfArrival(guestId: string) {
  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: { hostUser: true, floor: true },
    });
    if (!guest || guest.hostNotifiedAt || !guest.hostUser?.active) return;

    const hostEmail = guest.hostUser.email;

    // Push for speed, email as a record in case the push is missed. Send both at once.
    const [pushResult, emailResult] = await Promise.allSettled([
      sendPushToUser(guest.hostUser.id, {
        title: "Your guest has arrived",
        body: guestArrivedMessage(guest.guestName),
        url: "/floor",
        tag: `guest-${guest.id}`,
      }),
      hostEmail && smtpConfigured()
        ? sendGuestArrivedEmail({
            email: hostEmail,
            guestName: guest.guestName,
          }).then(() => true)
        : Promise.resolve(false),
    ]);

    if (pushResult.status === "rejected") console.error("Arrival push failed", pushResult.reason);
    if (emailResult.status === "rejected") console.error("Arrival email failed", emailResult.reason);

    const pushed = pushResult.status === "fulfilled" && pushResult.value > 0;
    const emailed = emailResult.status === "fulfilled" && emailResult.value;
    const via = pushed && emailed ? "push+email" : pushed ? "push" : emailed ? "email" : "none";

    await db.guest.update({
      where: { id: guest.id },
      data: { hostNotifiedAt: new Date(), hostNotifiedVia: via },
    });
  } catch (error) {
    console.error("Host notification failed", error);
  }
}
