import { NextResponse } from "next/server";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../../../../package.json") as { version: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER = "JerryDoko";
const REPO = "Resources_manager";
const RELEASES_LATEST_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "").split(/[+-]/)[0];
}

function compareVersions(a: string, b: string) {
  const pa = normalizeVersion(a).split(".").map((n) => Number(n) || 0);
  const pb = normalizeVersion(b).split(".").map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function GET() {
  const currentVersion = pkg.version;

  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Resources-Manager-Update-Checker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          currentVersion,
          updateAvailable: false,
          error: `GitHub release check failed (${res.status})`,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const release = (await res.json()) as GitHubRelease;
    const latestVersion = normalizeVersion(release.tag_name || "");
    const updateAvailable =
      !release.draft &&
      !release.prerelease &&
      latestVersion.length > 0 &&
      compareVersions(latestVersion, currentVersion) > 0;

    return NextResponse.json(
      {
        currentVersion,
        latestVersion,
        tagName: release.tag_name,
        updateAvailable,
        title: release.name || release.tag_name,
        url: release.html_url,
        publishedAt: release.published_at,
        notes: release.body || "",
        assets: (release.assets || []).map((asset) => ({
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        currentVersion,
        updateAvailable: false,
        error: e instanceof Error ? e.message : "Update check failed",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
