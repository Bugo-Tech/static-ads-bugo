import { NextRequest, NextResponse } from "next/server";
import { setCallbackResult } from "@/lib/nanoBanana";

// This endpoint receives callbacks from kie.ai when image generation completes
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log("kie.ai callback received:", JSON.stringify(data));

    const taskId = data.taskId || data.recordId || data.data?.taskId;

    if (!taskId) {
      console.error("Callback missing taskId:", data);
      return NextResponse.json({ ok: true });
    }

    // Extract result URL from various possible response formats
    const resultUrl =
      data.output?.image_url ||
      data.output?.resultImageUrl ||
      data.resultImageUrl ||
      data.image_url ||
      data.data?.response?.resultImageUrl ||
      data.data?.output?.image_url ||
      (Array.isArray(data.output) ? data.output[0] : null);

    const errorMsg =
      data.error ||
      data.errorMessage ||
      data.data?.errorMessage;

    if (resultUrl) {
      setCallbackResult(taskId, {
        status: "completed",
        resultUrl,
      });
    } else if (errorMsg) {
      setCallbackResult(taskId, {
        status: "failed",
        error: errorMsg,
      });
    } else {
      // Try to detect success from the full payload
      console.log("Callback payload structure:", Object.keys(data));
      setCallbackResult(taskId, {
        status: "completed",
        resultUrl: JSON.stringify(data), // Store full response for debugging
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.json({ ok: true });
  }
}
