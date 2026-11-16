import { NextResponse } from "next/server";
import { getLatestAppRelease } from "@/lib/app-release";

/**
 * The newest Android app release, so the app can offer an update.
 * Public (no sign-in) so the app can check from the sign-in screen too.
 */
export async function GET() {
  try {
    const release = await getLatestAppRelease();
    return NextResponse.json(release ? { available: true, ...release } : { available: false });
  } catch (error) {
    console.error("App update check failed", error);
    return NextResponse.json({ error: "Couldn't check for updates right now." }, { status: 502 });
  }
}
