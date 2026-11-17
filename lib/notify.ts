import { db } from "@/lib/db";
import { formatOfficeDate, formatTimeOfDay, fromDateOnly } from "@/lib/dates";
import { sendAppAlertToUser } from "@/lib/fcm";
import {
  guestArrivedMessage,
  inviteeAddedMessage,
  inviteeArrivedMessage,
  sendNoticeEmail,
  smtpConfigured,
} from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";

type Alert = { title: string; body: string; tag: string; guestId: string; emailSubject: string };

/**
 * Push (browser + Android app) and email to one person, all at once.
 * Returns how they were reached: "push+email", "push", "email" or "none". Never throws.
 */
async function alertPerson(user: { id: string; email: string | null }, alert: Alert) {
  const [web, app, mail] = await Promise.allSettled([
    sendPushToUser(user.id, { title: alert.title, body: alert.body, url: "/floor", tag: alert.tag }),
    sendAppAlertToUser(user.id, { title: alert.title, body: alert.body, tag: alert.tag, guestId: alert.guestId }),
    user.email && smtpConfigured()
      ? sendNoticeEmail({ email: user.email, subject: alert.emailSubject, message: alert.body }).then(() => true)
      : Promise.resolve(false),
  ]);
  for (const [name, result] of [["push", web], ["app alert", app], ["email", mail]] as const) {
    if (result.status === "rejected") console.error(`Guest ${name} failed`, result.reason);
  }
  const pushed =
    (web.status === "fulfilled" && web.value > 0) || (app.status === "fulfilled" && app.value > 0);
  const emailed = mail.status === "fulfilled" && mail.value;
  return pushed && emailed ? "push+email" : pushed ? "push" : emailed ? "email" : "none";
}

/**
 * Tells everyone who should know that a guest is at reception: the host, and
 * the colleagues on the guest's "Also notify" list. Runs once per arrival
 * (hostNotifiedAt). Never throws; a failed alert must not block reception.
 */
export async function notifyArrival(guestId: string) {
  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: {
        hostUser: true,
        invitees: { where: { notifiedAt: null }, include: { user: true } },
      },
    });
    if (!guest || guest.hostNotifiedAt) return;
    const hostName = guest.hostUser?.name || guest.hostName;
    const tag = `guest-${guest.id}`;

    const hostAlert =
      guest.hostUser?.active
        ? alertPerson(guest.hostUser, {
            title: "Your guest has arrived",
            body: guestArrivedMessage(guest.guestName),
            tag,
            guestId: guest.id,
            emailSubject: `Your guest ${guest.guestName} has arrived`,
          })
        : Promise.resolve(null);

    const inviteeAlerts = guest.invitees
      .filter((i) => i.user.active && i.userId !== guest.hostUserId)
      .map(async (invitee) => {
        const via = await alertPerson(invitee.user, {
          title: `${guest.guestName} has arrived`,
          body: inviteeArrivedMessage(guest.guestName, hostName),
          tag,
          guestId: guest.id,
          emailSubject: `${guest.guestName} (${hostName}'s guest) has arrived`,
        });
        await db.guestInvitee.update({ where: { id: invitee.id }, data: { notifiedAt: new Date(), notifiedVia: via } });
      });

    const [hostVia] = await Promise.all([hostAlert, Promise.allSettled(inviteeAlerts)]);
    await db.guest.update({
      where: { id: guest.id },
      data: { hostNotifiedAt: new Date(), hostNotifiedVia: hostVia ?? "none" },
    });
  } catch (error) {
    console.error("Arrival notification failed", error);
  }
}

/**
 * Heads-up for colleagues just added to a visit's "Also notify" list:
 * "Hana added you to Abebe Kebede's visit · Tuesday 17 November, 10:30 AM."
 */
export async function notifyInviteesAdded(guestId: string, userIds: string[], addedBy: string) {
  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: { invitees: { where: { userId: { in: userIds } }, include: { user: true } } },
    });
    if (!guest || guest.status === "CANCELLED" || guest.status === "NO_SHOW") return;
    const when = [formatOfficeDate(fromDateOnly(guest.visitDate)), formatTimeOfDay(guest.expectedArrival)]
      .filter(Boolean)
      .join(", ");
    const body = inviteeAddedMessage(addedBy, guest.guestName, when);
    await Promise.allSettled(
      guest.invitees
        .filter((i) => i.user.active)
        .map((i) =>
          alertPerson(i.user, {
            title: "You've been added to a visit",
            body,
            tag: `invite-${guest.id}`,
            guestId: guest.id,
            emailSubject: `${addedBy} added you to ${guest.guestName}'s visit`,
          }),
        ),
    );
  } catch (error) {
    console.error("Invite notification failed", error);
  }
}
