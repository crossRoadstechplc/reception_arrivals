import webpush from "web-push";
import { db } from "@/lib/db";

let configured: boolean | null = null;

export function pushConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:desk@localhost";
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("Web push keys are invalid. Check the VAPID_* values in .env.", error);
    configured = false;
  }
  return configured;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Sends a notification to every browser the user enabled.
 * Returns how many browsers accepted it. Expired subscriptions are removed.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!pushConfigured()) return 0;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 30, urgency: "high" },
      ),
    ),
  );

  const dead: string[] = [];
  let delivered = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      delivered += 1;
      return;
    }
    const status = (result.reason as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) dead.push(subscriptions[index].id);
    else console.error("Push send failed", status, result.reason);
  });

  if (dead.length) await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  return delivered;
}
