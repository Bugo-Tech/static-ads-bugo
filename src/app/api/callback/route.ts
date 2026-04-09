import { NextRequest, NextResponse } from "next/server";

// Webhook endpoint for kie.ai callbacks (future use)
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log("kie.ai callback received:", JSON.stringify(data));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
