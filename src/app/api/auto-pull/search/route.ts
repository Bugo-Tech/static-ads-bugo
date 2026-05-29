import { NextRequest, NextResponse } from "next/server";
import { startAdsRun, type AdActiveStatus } from "@/lib/apify";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: unknown;
      limit?: unknown;
      activeStatus?: unknown;
    };

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    if (!/^https?:\/\/(www\.|web\.)?facebook\.com\//i.test(url)) {
      return NextResponse.json(
        { error: "URL must be a facebook.com URL (page or Ad Library search)" },
        { status: 400 }
      );
    }

    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 10;
    const activeStatus = parseActiveStatus(body.activeStatus);

    const { runId, datasetId } = await startAdsRun({ url, limit, activeStatus });
    return NextResponse.json({ runId, datasetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("Auto-pull search error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseActiveStatus(v: unknown): AdActiveStatus {
  if (v === "active" || v === "inactive" || v === "") return v;
  return "active";
}
