/**
 * Bugo Birds Claude wrapper — parallel to pet-tag-claude.ts. Uses birds brand
 * config + prompts. Completely isolated: separate brand config path, separate
 * prompt builders.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, CopyVariation, Language } from "./types";
import { getBirdsAnalysisPrompt } from "./birds-prompts";
import { defaultBirdsBrandConfig, type BirdsBrandConfig } from "./birds-defaults";
import { readBrandConfigFile } from "./brand-config-store";
import { extractJsonFromClaudeText } from "./claude-json";

function getClient() {
  return new Anthropic();
}

export async function loadBirdsBrandConfig(): Promise<BirdsBrandConfig> {
  return readBrandConfigFile("birds", defaultBirdsBrandConfig);
}

export async function analyzeBirdsReference(
  imageBase64: string,
  mimeType: string,
  language: Language
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const client = getClient();
  const brandConfig = await loadBirdsBrandConfig();

  const systemPrompt = getBirdsAnalysisPrompt(brandConfig, language);

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
            text: "Analyze this reference ad image and generate the Nano Banana prompt and copy variations adapted for the Bugo Birds pigeon/bird repeller. Return the response as JSON.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Claude's response was cut off before it finished. Try again, or simplify the reference ad."
    );
  }

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Sonnet may wrap the JSON in fences, or add a preamble/postamble, or leave a
  // trailing comma. The main flow has used this helper for a while; the
  // verticals were left on a fence-only match that threw on all the other
  // cases — and the thrown SyntaxError surfaced as a blank screen.
  const parsed = JSON.parse(extractJsonFromClaudeText(textContent.text));

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

export async function translateBirdsVariations(
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
    throw new Error(`Birds translator: no source text. direction=${direction}`);
  }

  const systemPrompt = `You are a professional marketing translator for Bugo Birds, a pigeon/bird repeller device.

Translate ad copy from ${sourceLangName} to ${targetLangName}.

Style:
- Natural, idiomatic, marketing-grade ${targetLangName}. Speaks to homeowners and building managers frustrated by pigeon droppings and damage — tone is calm, practical, focused on restoring a clean and protected space without harming the birds.
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
