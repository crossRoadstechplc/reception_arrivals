import { NextResponse } from "next/server";

/**
 * The newest Android app release, so the app can offer an update.
 *
 * Releases are made from a developer PC by mobile/release.ps1: each one is a
 * GitHub release tagged "app-v<version>+<build>" with the signed APK attached and
 * a "sha256: <hex>" line in its notes, which the app checks after downloading.
 * Public (no sign-in) so the app can check from the sign-in screen too.
 *
 * Optional env: GITHUB_REPO (default below), GITHUB_TOKEN (higher rate limit,
 * or needed if the repository becomes private).
 */

const REPO = process.env.GITHUB_REPO || "crossRoadstechplc/reception_arrivals";
const TAG = /^app-v(\d+\.\d+\.\d+)\+(\d+)$/;
const CHECKSUM_LINE = /^sha256:\s*([a-f0-9]{64})\s*$/i;

type Release = {
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { name: string; browser_download_url: string; size: number }[];
};

export async function GET() {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "arrival-desk-update-check",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let releases: Release[];
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers,
      // Cache on the server for 5 minutes so phones don't hit GitHub's rate limit.
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    releases = (await response.json()) as Release[];
  } catch (error) {
    console.error("App update check failed", error);
    return NextResponse.json({ error: "Couldn't check for updates right now." }, { status: 502 });
  }

  const latest = releases
    .filter((r) => !r.draft && !r.prerelease && TAG.test(r.tag_name))
    .map((r) => {
      const [, versionName, build] = r.tag_name.match(TAG)!;
      const apk = r.assets.find((a) => a.name.endsWith(".apk"));
      return { release: r, versionName, buildNumber: Number(build), apk };
    })
    .filter((r) => r.apk)
    .sort((a, b) => b.buildNumber - a.buildNumber)[0];

  if (!latest) return NextResponse.json({ available: false });

  const lines = (latest.release.body ?? "").split(/\r?\n/);
  const sha256 = lines.map((line) => line.trim().match(CHECKSUM_LINE)?.[1]).find(Boolean) ?? null;
  const notes = lines
    .filter((line) => !CHECKSUM_LINE.test(line.trim()))
    .join("\n")
    .trim()
    .slice(0, 1000);

  return NextResponse.json({
    available: true,
    versionName: latest.versionName,
    buildNumber: latest.buildNumber,
    notes,
    sha256: sha256?.toLowerCase() ?? null,
    publishedAt: latest.release.published_at,
    downloadUrl: latest.apk!.browser_download_url,
    size: latest.apk!.size,
  });
}
