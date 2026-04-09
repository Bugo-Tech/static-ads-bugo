import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";
import { AnalysisResult, CopyVariation, BrandConfig, Language } from "./types";
import { getAnalysisPrompt, getCopyGenerationPrompt } from "./prompts";
import { defaultBrandConfig } from "./brand-defaults";

const BRAND_CONFIG_PATH = path.join(process.cwd(), "uploads", "brand", "brand-config.json");

function getClient() {
  return new Anthropic();
}

async function loadBrandConfig(): Promise<BrandConfig> {
  try {
    const data = await readFile(BRAND_CONFIG_PATH, "utf-8");
    return { ...defaultBrandConfig, ...JSON.parse(data) };
  } catch {
    return defaultBrandConfig;
  }
}

export async function analyzeReference(
  imageBase64: string,
  mimeType: string,
  language: Language
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const client = getClient();
  const brandConfig = await loadBrandConfig();

  const systemPrompt = getAnalysisPrompt(brandConfig, language);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
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
            text: "Analyze this reference ad image and generate the Nano Banana prompt and copy variations. Return the response as JSON.",
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = textContent.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const parsed = JSON.parse(jsonStr.trim());

  return {
    analysis: parsed.analysis,
    copyVariations: parsed.copyVariations,
  };
}

export async function generateCopy(
  analysis: AnalysisResult,
  language: Language
): Promise<CopyVariation[]> {
  const client = getClient();
  const brandConfig = await loadBrandConfig();

  const systemPrompt = getCopyGenerationPrompt(brandConfig, language);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Based on this analysis, generate 3-4 copy variations adapted for Bugo:\n\n${JSON.stringify(analysis, null, 2)}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textContent.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const parsed = JSON.parse(jsonStr.trim());
  return parsed.copyVariations || parsed;
}
