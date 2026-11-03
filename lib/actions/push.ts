"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/permissions";
import { sendPushToUser } from "@/lib/push";
import type { ActionResult } from "@/lib/types";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export async function savePushSubscription(input: unknown, userAgent?: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This browser sent an invalid subscription." };

  const { endpoint, keys } = parsed.data;
  // One browser = one endpoint. If someone else signs in on it, it moves to them.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id, userAgent: userAgent?.slice(0, 300) },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id, userAgent: userAgent?.slice(0, 300) },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult> {
  const user = await requireUser();
  const delivered = await sendPushToUser(user.id, {
    title: "Notifications are on",
    body: "You'll get an alert here when your guests arrive at reception.",
    url: "/floor",
    tag: "test",
  });
  if (delivered === 0) return { ok: false, error: "No browser accepted the test. Try turning alerts off and on again." };
  return { ok: true, notice: "Test notification sent." };
}
