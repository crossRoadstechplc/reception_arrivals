import { NextResponse } from "next/server";
import { fcmConfigured, sendAppAlertToUser } from "@/lib/fcm";
import { withMobileUser } from "@/lib/mobile-auth";

/** Sends a test arrival alert to the signed-in person's phones. */
export async function POST(request: Request) {
  return withMobileUser(request, async (user) => {
    if (!fcmConfigured()) {
      return NextResponse.json({ ok: false, error: "Phone alerts aren't set up on the server yet." }, { status: 503 });
    }
    const delivered = await sendAppAlertToUser(user.id, {
      title: "Alerts are on",
      body: "You'll get an alert here when your guests arrive at reception.",
      tag: "test",
    });
    if (delivered === 0) {
      return NextResponse.json({ ok: false, error: "This phone isn't registered yet. Turn alerts off and on again." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, notice: "Test alert sent." });
  });
}
