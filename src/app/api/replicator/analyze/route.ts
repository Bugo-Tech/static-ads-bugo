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
      model: "claude-sonnet-4-6",
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
    // Strip markdown code fences if present.
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();

    // Strip any preamble / postamble: extract the first balanced JSON object
    // or array. Sonnet 4.6 sometimes wraps JSON in prose like "Here is the
    // analysis: {...}" — the older 4.0 model behaved differently.
    const startObj = jsonStr.indexOf("{");
    const startArr = jsonStr.indexOf("[");
    let start = -1;
    if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
    else if (startObj >= 0) start = startObj;
    else if (startArr >= 0) start = startArr;
    if (start > 0) jsonStr = jsonStr.slice(start);

    if (jsonStr.length > 0) {
      const opener = jsonStr[0];
      const closer = opener === "[" ? "]" : "}";
      let depth = 0;
      let end = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === opener) depth++;
        if (jsonStr[i] === closer) depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
      if (end > 0) jsonStr = jsonStr.slice(0, end);
    }

    // Tolerate trailing commas.
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    let analysis: ReplicatorAnalysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to parse analysis JSON",
          raw: jsonStr.substring(0, 500),
          parseError: err instanceof Error ? err.message : "unknown",
        },
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
