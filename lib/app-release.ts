/**
 * The newest Android app release on GitHub.
 *
 * Releases are made from a developer PC by mobile/release.ps1: each one is a
 * GitHub release tagged "app-v<version>+<build>" with the signed APK attached and
 * a "sha256: <hex>" line in its notes, which the app checks after downloading.
 *
 * Optional env: GITHUB_REPO (default below), GITHUB_TOKEN (higher rate limit,
 * or needed if the repository becomes private).
 */

export const APP_REPO = process.env.GITHUB_REPO || "crossRoadstechplc/reception_arrivals";
export const APP_RELEASES_PAGE = `https://github.com/${APP_REPO}/releases`;

const TAG = /^app-v(\d+\.\d+\.\d+)\+(\d+)$/;
const CHECKSUM_LINE = /^sha256:\s*([a-f0-9]{64})\s*$/i;

type GithubRelease = {
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { name: string; browser_download_url: string; size: number }[];
};

export type AppRelease = {
  versionName: string;
  buildNumber: number;
  notes: string;
  sha256: string | null;
  publishedAt: string | null;
  downloadUrl: string;
  size: number;
};

/** The newest published release with an APK, or null. Throws if GitHub can't be reached. */
export async function getLatestAppRelease(): Promise<AppRelease | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "arrival-desk-update-check",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(`https://api.github.com/repos/${APP_REPO}/releases?per_page=20`, {
    headers,
    // Cache on the server for 5 minutes so phones don't hit GitHub's rate limit.
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const releases = (await response.json()) as GithubRelease[];

  const latest = releases
    .filter((r) => !r.draft && !r.prerelease && TAG.test(r.tag_name))
    .map((r) => {
      const [, versionName, build] = r.tag_name.match(TAG)!;
      const apk = r.assets.find((a) => a.name.endsWith(".apk"));
      return { release: r, versionName, buildNumber: Number(build), apk };
    })
    .filter((r) => r.apk)
    .sort((a, b) => b.buildNumber - a.buildNumber)[0];
  if (!latest) return null;

  const lines = (latest.release.body ?? "").split(/\r?\n/);
  const sha256 = lines.map((line) => line.trim().match(CHECKSUM_LINE)?.[1]).find(Boolean) ?? null;
  const notes = lines
    .filter((line) => !CHECKSUM_LINE.test(line.trim()))
    .join("\n")
    .trim()
    .slice(0, 1000);

  return {
    versionName: latest.versionName,
    buildNumber: latest.buildNumber,
    notes,
    sha256: sha256?.toLowerCase() ?? null,
    publishedAt: latest.release.published_at,
    downloadUrl: latest.apk!.browser_download_url,
    size: latest.apk!.size,
  };
}
