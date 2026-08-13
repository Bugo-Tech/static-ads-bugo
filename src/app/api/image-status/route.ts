import { NextRequest, NextResponse } from "next/server";
import { checkStatus } from "@/lib/nanoBanana";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobIdsParam = searchParams.get("jobIds");
    const jobId = searchParams.get("jobId");

    // Batch mode: one request checks all active jobs in parallel
    if (jobIdsParam) {
      // Dedupe and cap so one request can't fan out unbounded upstream calls
      const jobIds = [...new Set(jobIdsParam.split(",").filter(Boolean))].slice(0, 50);
      if (jobIds.length === 0) {
        return NextResponse.json({ error: "No jobIds provided" }, { status: 400 });
      }

      const results = await Promise.all(
        jobIds.map(async (id) => {
          try {
            return [id, await checkStatus(id)] as const;
          } catch {
            return [id, { status: "processing" as const }] as const;
          }
        })
      );

      return NextResponse.json({ statuses: Object.fromEntries(results) });
    }

    if (!jobId) {
      return NextResponse.json({ error: "No jobId provided" }, { status: 400 });
    }

    const status = await checkStatus(jobId);

    return NextResponse.json(status);
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { status: "processing", error: "Status check failed" },
      { status: 200 } // return 200 so polling continues
    );
  }
}
