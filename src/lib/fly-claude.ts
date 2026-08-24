/**
 * Bugo Fly Claude wrapper — parallel to pet-tag-claude.ts. Uses fly brand
 * config + prompts. Completely isolated: separate brand config path, separate
 * prompt builders.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, CopyVariation, Language } from "./types";
import { getFlyAnalysisPrompt } from "./fly-prompts";
import { defaultFlyBrandConfig, type FlyBrandConfig } from "./fly-defaults";
import { readBrandConfigFile } from "./brand-config-store";
import { analyzeReferenceSplit } from "./claude-analyze";

function getClient() {
  return new Anthropic();
}

export async function loadFlyBrandConfig(): Promise<FlyBrandConfig> {
  return readBrandConfigFile("fly", defaultFlyBrandConfig);
}

export async function analyzeFlyReference(
  imageBase64: string,
  mimeType: string,
  language: Language
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const client = getClient();
  const brandConfig = await loadFlyBrandConfig();

  const systemPrompt = getFlyAnalysisPrompt(brandConfig, language);

  return analyzeReferenceSplit(
    client,
    systemPrompt,
    imageBase64,
    mimeType,
    "the Bugo Fly mosquito and fly trap"
  );
}

const LANGUAGE_FULL_NAMES: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

export async function translateFlyVariations(
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
    throw new Error(`Fly translator: no source text. direction=${direction}`);
  }

  const systemPrompt = `You are a professional marketing translator for Bugo Fly, a mosquito/fly repeller device.

Translate ad copy from ${sourceLangName} to ${targetLangName}.

Style:
- Natural, idiomatic, marketing-grade ${targetLangName}. Warm tone, speaks to parents and homeowners about peaceful sleep and safe environments.
- Preserve UPPERCASE/lowercase style of the source.
- Keep numbers, percentages, currency symbols, and punctuation intact.

Output: ONLY a valid JSON object, no prose, no markdown, no code fences.
The JSON has the same keys as the input, with values being the ${targetLangName} translations.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    // The system prompt is identical for every call with the same brand and
    // language — roughly 4,900 tokens of it. Caching cuts the repeat cost by
    // ~90% and shaves a few seconds off each call. It does not solve the
    // function timeout: output generation, not input processing, is what takes
    // the time (measured 83.6s -> 76.6s on a real ad).
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
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
