import { NextRequest, NextResponse } from "next/server";
import { getRunStatus, getDatasetAds } from "@/lib/apify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const datasetId = searchParams.get("datasetId");

    if (!runId || !datasetId) {
      return NextResponse.json({ error: "Missing runId or datasetId" }, { status: 400 });
    }

    const status = await getRunStatus(runId);

    if (status === "SUCCEEDED") {
      const ads = await getDatasetAds(datasetId);
      return NextResponse.json({ status, ads });
    }

    return NextResponse.json({ status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    console.error("Auto-pull status error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
