import { NextResponse } from "next/server";
import { officeTodayISO } from "@/lib/dates";
import { loadFloorContext } from "@/lib/floor-context";
import { fcmConfigured } from "@/lib/fcm";
import { issueMobileToken, withMobileUser } from "@/lib/mobile-auth";

/** Who is signed in and which floors they work on. */
export async function GET(request: Request) {
  return withMobileUser(request, async (user) => {
    const { floors } = await loadFloorContext(user);
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      // A fresh token each check-in, so people who use the app are never signed out.
      token: await issueMobileToken(user),
      floors,
      // Public connection details for live updates (the same ones the website uses).
      realtime:
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
          : null,
      today: officeTodayISO(),
      alertsAvailable: fcmConfigured(),
    });
  });
}
