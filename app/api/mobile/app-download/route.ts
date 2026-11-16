import { NextResponse } from "next/server";
import { APP_RELEASES_PAGE, getLatestAppRelease } from "@/lib/app-release";

/**
 * A stable "download the Android app" link: always redirects to the newest APK
 * on GitHub, so the website's button never needs changing after a release.
 */
export async function GET() {
  try {
    const release = await getLatestAppRelease();
    return NextResponse.redirect(release?.downloadUrl ?? APP_RELEASES_PAGE, 302);
  } catch (error) {
    console.error("App download lookup failed", error);
    return NextResponse.redirect(APP_RELEASES_PAGE, 302);
  }
}
