import { NextRequest, NextResponse } from "next/server";
import { checkStatus } from "@/lib/nanoBanana";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

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
