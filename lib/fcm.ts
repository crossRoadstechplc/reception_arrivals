import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "@/lib/db";

/**
 * Firebase Cloud Messaging for the Android app.
 *
 * Set FIREBASE_SERVICE_ACCOUNT to the service-account key JSON from
 * Firebase console > Project settings > Service accounts > Generate new private key.
 * Paste the JSON as one line, or base64-encode it. Without it, app alerts are skipped
 * (the host still gets the email).
 */

/** Must match the channel the app creates (mobile/lib/notifications.dart). */
export const ARRIVAL_CHANNEL_ID = "arrivals";

let app: App | null | undefined;

function firebaseApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return (app = null);
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const account = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    app =
      getApps().find((a) => a.name === "arrival-desk") ??
      initializeApp(
        {
          credential: cert({
            projectId: account.project_id,
            clientEmail: account.client_email,
            // Keys pasted into env settings often have literal "\n".
            privateKey: account.private_key.replace(/\\n/g, "\n"),
          }),
        },
        "arrival-desk",
      );
  } catch (error) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not a valid service-account key.", error);
    app = null;
  }
  return app;
}

export function fcmConfigured() {
  return firebaseApp() !== null;
}

export type AppAlert = { title: string; body: string; tag?: string; guestId?: string };

/**
 * Sends a heads-up alert to every phone the user signed in to the app on.
 * Returns how many phones accepted it. Tokens Firebase no longer knows are removed.
 */
export async function sendAppAlertToUser(userId: string, alert: AppAlert) {
  const firebase = firebaseApp();
  if (!firebase) return 0;
  const devices = await db.deviceToken.findMany({ where: { userId } });
  if (devices.length === 0) return 0;

  const response = await getMessaging(firebase).sendEachForMulticast({
    tokens: devices.map((d) => d.token),
    notification: { title: alert.title, body: alert.body },
    data: { type: "guest-arrived", guestId: alert.guestId ?? "", tag: alert.tag ?? "" },
    android: {
      priority: "high",
      ttl: 30 * 60 * 1000,
      notification: {
        channelId: ARRIVAL_CHANNEL_ID,
        sound: "arrival",
        icon: "ic_stat_arrival",
        color: "#d85a2a",
        tag: alert.tag,
        defaultVibrateTimings: false,
        vibrateTimingsMillis: [0, 120, 80, 120, 80, 320],
        visibility: "public",
        priority: "max",
      },
    },
  });

  const dead: string[] = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code ?? "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      dead.push(devices[index].id);
    } else {
      console.error("App alert failed", code, result.error?.message);
    }
  });
  if (dead.length) await db.deviceToken.deleteMany({ where: { id: { in: dead } } });
  return response.successCount;
}
