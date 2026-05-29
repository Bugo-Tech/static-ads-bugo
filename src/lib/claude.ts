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
  language: Language,
  productId?: string
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const client = getClient();
  const brandConfig = await loadBrandConfig();

  // If a specific product is selected, override brand-level fields with product-specific ones
  const selectedProduct = productId
    ? brandConfig.products?.find((p) => p.id === productId)
    : undefined;

  const effectiveBrand = selectedProduct
    ? {
        ...brandConfig,
        productSpecs: {
          ...brandConfig.productSpecs,
          ...(selectedProduct.specs || {}),
        },
        pestTypes: selectedProduct.pestTypes || brandConfig.pestTypes,
      }
    : brandConfig;

  const systemPrompt = getAnalysisPrompt(effectiveBrand, language, selectedProduct?.name);

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

const LANGUAGE_FULL_NAMES: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

export async function translateVariations(
  variations: CopyVariation[],
  language: Language,
  direction: "foreign-to-hebrew" | "hebrew-to-foreign"
): Promise<CopyVariation[]> {
  if (!variations || variations.length === 0) return variations;

  const client = getClient();
  const foreignName = LANGUAGE_FULL_NAMES[language];

  const sourceField = direction === "foreign-to-hebrew" ? "adaptedText" : "hebrewText";
  const targetField = direction === "foreign-to-hebrew" ? "hebrewText" : "adaptedText";
  const sourceLangName = direction === "foreign-to-hebrew" ? foreignName : "Hebrew";
  const targetLangName = direction === "foreign-to-hebrew" ? "Hebrew" : foreignName;

  // Flatten to a simple { sectionId: text } map — much more reliable than asking
  // Claude to round-trip a nested structure.
  const inputMap: Record<string, string> = {};
  for (const v of variations) {
    for (const s of v.sections) {
      const key = `${v.id}::${s.id}`;
      const src = direction === "foreign-to-hebrew" ? s.adaptedText : (s.hebrewText ?? "");
      if (src && src.trim()) inputMap[key] = src;
    }
  }

  if (Object.keys(inputMap).length === 0) {
    const debug = variations.map((v) => ({
      id: v.id,
      sectionCount: v.sections?.length ?? 0,
      sampleSection: v.sections?.[0]
        ? {
            id: v.sections[0].id,
            label: v.sections[0].label,
            hasAdaptedText: typeof v.sections[0].adaptedText === "string",
            adaptedTextPreview: typeof v.sections[0].adaptedText === "string"
              ? v.sections[0].adaptedText.slice(0, 60)
              : null,
            hasHebrewText: typeof v.sections[0].hebrewText === "string",
            hebrewTextPreview: typeof v.sections[0].hebrewText === "string"
              ? v.sections[0].hebrewText.slice(0, 60)
              : null,
            allKeys: Object.keys(v.sections[0]),
          }
        : null,
    }));
    throw new Error(
      `No source text to translate. direction=${direction}, sourceField=${sourceField}, variations=${JSON.stringify(debug)}`
    );
  }

  const systemPrompt = `You are a professional marketing translator for Bugo, a pest-control brand.

Your task: translate ad copy from ${sourceLangName} to ${targetLangName}.

Style:
- Natural, idiomatic, marketing-grade ${targetLangName}. Concise. Not literal.
- Preserve UPPERCASE/lowercase style of the source.
- Keep numbers, percentages, currency symbols, and punctuation intact.

Output format: you MUST return ONLY a valid JSON object. No prose, no markdown, no code fences.
The JSON object has the same keys as the input, with values being the ${targetLangName} translations.

Example input:  {"v1::s1": "Save up to 50%", "v1::s2": "Free shipping"}
Example output: {"v1::s1": "חסוך עד 50%", "v1::s2": "משלוח חינם"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Translate the values of this JSON to ${targetLangName}. Return only JSON, no other text.\n\n${JSON.stringify(inputMap)}`,
      },
      // Prefill assistant turn with "{" so Claude is forced to continue with JSON.
      { role: "assistant", content: "{" },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // Re-add the prefilled "{" and isolate the JSON object.
  let raw = "{" + textContent.text;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Claude response had no JSON object. Raw: ${raw.slice(0, 200)}`);
  }
  const jsonStr = raw.slice(firstBrace, lastBrace + 1);

  let outputMap: Record<string, string>;
  try {
    outputMap = JSON.parse(jsonStr);
  } catch (parseErr) {
    throw new Error(`JSON parse failed: ${parseErr instanceof Error ? parseErr.message : "unknown"}. Raw: ${jsonStr.slice(0, 200)}`);
  }

  if (!outputMap || typeof outputMap !== "object") {
    throw new Error("Parsed output is not an object");
  }

  // Count how many translations actually came back so we can detect partial failures.
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
