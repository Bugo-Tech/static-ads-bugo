import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Language } from "@/lib/types";
import { getReplicatorAnalysisPrompt, ReplicatorAnalysis } from "@/lib/replicator-prompts";

/**
 * Replicator analyze endpoint — DOES NOT touch /api/analyze.
 * Detects Indoor vs Outdoor + extracts canvas text + returns translated copy.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, mimeType, language } = body as {
      imageBase64: string;
      mimeType: string;
      language: Language;
    };

    if (!imageBase64 || !language) {
      return NextResponse.json({ error: "imageBase64 and language required" }, { status: 400 });
    }

    const client = new Anthropic();
    const systemPrompt = getReplicatorAnalysisPrompt(language);

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "Analyze this Pest Lab reference. Return only the JSON object specified in the system prompt.",
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No analysis from Claude" }, { status: 500 });
    }

    let jsonStr = textContent.text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    let analysis: ReplicatorAnalysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to parse analysis JSON", raw: jsonStr.substring(0, 500), parseError: err instanceof Error ? err.message : "unknown" },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Replicator analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
