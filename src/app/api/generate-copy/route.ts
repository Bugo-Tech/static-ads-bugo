import { NextRequest, NextResponse } from "next/server";
import { generateCopy } from "@/lib/claude";
import { AnalysisResult, Language } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysis, language = "he" } = body as {
      analysis: AnalysisResult;
      language?: Language;
    };

    if (!analysis) {
      return NextResponse.json({ error: "No analysis provided" }, { status: 400 });
    }

    const copyVariations = await generateCopy(analysis, language);

    return NextResponse.json({ copyVariations });
  } catch (error) {
    console.error("Generate copy error:", error);
    const message = error instanceof Error ? error.message : "Copy generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
