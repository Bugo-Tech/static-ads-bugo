/**
 * Bugo Ants Claude wrapper — parallel to pet-tag-claude.ts. Uses ants brand
 * config + prompts. Completely isolated: separate brand config path, separate
 * prompt builders.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";
import type { AnalysisResult, CopyVariation, Language } from "./types";
import { getAntsAnalysisPrompt } from "./ants-prompts";
import { defaultAntsBrandConfig, type AntsBrandConfig } from "./ants-defaults";

const ANTS_BRAND_CONFIG_PATH = path.join(process.cwd(), "uploads", "ants", "brand-config.json");

function getClient() {
  return new Anthropic();
}

export async function loadAntsBrandConfig(): Promise<AntsBrandConfig> {
  try {
    const data = await readFile(ANTS_BRAND_CONFIG_PATH, "utf-8");
    return { ...defaultAntsBrandConfig, ...JSON.parse(data) };
  } catch {
    return defaultAntsBrandConfig;
  }
}

export async function analyzeAntsReference(
  imageBase64: string,
  mimeType: string,
  language: Language
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const client = getClient();
  const brandConfig = await loadAntsBrandConfig();

  const systemPrompt = getAntsAnalysisPrompt(brandConfig, language);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
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
            text: "Analyze this reference ad image and generate the Nano Banana prompt and copy variations adapted for the Bugo Ants gel ant trap. Return the response as JSON.",
          },
        ],
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

  return {
    analysis: parsed.analysis,
    copyVariations: parsed.copyVariations,
  };
}

const LANGUAGE_FULL_NAMES: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

export async function translateAntsVariations(
  variations: CopyVariation[],
  language: Language,
  direction: "foreign-to-hebrew" | "hebrew-to-foreign"
): Promise<CopyVariation[]> {
  if (!variations || variations.length === 0) return variations;

  const client = getClient();
  const foreignName = LANGUAGE_FULL_NAMES[language];

  const sourceLangName = direction === "foreign-to-hebrew" ? foreignName : "Hebrew";
  const targetLangName = direction === "foreign-to-hebrew" ? "Hebrew" : foreignName;

  const inputMap: Record<string, string> = {};
  for (const v of variations) {
    for (const s of v.sections) {
      const key = `${v.id}::${s.id}`;
      const src = direction === "foreign-to-hebrew" ? s.adaptedText : (s.hebrewText ?? "");
      if (src && src.trim()) inputMap[key] = src;
    }
  }

  if (Object.keys(inputMap).length === 0) {
    throw new Error(`Ants translator: no source text. direction=${direction}`);
  }

  const systemPrompt = `You are a professional marketing translator for Bugo Ants, a passive gel ant trap that eliminates the entire colony.

Translate ad copy from ${sourceLangName} to ${targetLangName}.

Style:
- Natural, idiomatic, marketing-grade ${targetLangName}. Speaks to Israeli parents fighting the summer ant invasion in their kitchen — tone is warm, practical, empathetic. Focused on colony destruction (queen included), boric-acid-based natural safety, and passive set-and-forget simplicity. Avoid clinical/scientific jargon.
- Preserve UPPERCASE/lowercase style of the source.
- Keep numbers, percentages, currency symbols, and punctuation intact.

Output: ONLY a valid JSON object, no prose, no markdown, no code fences.
The JSON has the same keys as the input, with values being the ${targetLangName} translations.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Translate the values of this JSON to ${targetLangName}. Return only JSON, no other text.\n\n${JSON.stringify(inputMap)}`,
      },
      { role: "assistant", content: "{" },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  let raw = "{" + textContent.text;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Claude response had no JSON. Raw: ${raw.slice(0, 200)}`);
  }
  const jsonStr = raw.slice(firstBrace, lastBrace + 1);
  const outputMap: Record<string, string> = JSON.parse(jsonStr);

  let translatedCount = 0;
  const result = variations.map((v) => ({
    ...v,
    sections: v.sections.map((s) => {
      const key = `${v.id}::${s.id}`;
      const translated = outputMap[key];
      if (typeof translated !== "string" || translated.length === 0) return s;
      translatedCount++;
      if (direction === "foreign-to-hebrew") {
        return { ...s, hebrewText: translated };
      }
      return { ...s, adaptedText: translated };
    }),
  }));

  if (translatedCount === 0) {
    throw new Error(`Claude returned object with no matching keys. Got: ${Object.keys(outputMap).slice(0, 5).join(", ")}`);
  }

  return result;
}
