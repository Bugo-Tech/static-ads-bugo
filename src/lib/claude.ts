import Anthropic from "@anthropic-ai/sdk";
import { AnalysisResult, CopyVariation, BrandConfig, Language } from "./types";
import { getAnalysisPrompt, getCopyGenerationPrompt } from "./prompts";
import { defaultBrandConfig } from "./brand-defaults";
import { extractJsonFromClaudeText } from "./claude-json";
import { getBrandConfig } from "./supabase-db";
import { analyzeReferenceSplit } from "./claude-analyze";

function getClient() {
  return new Anthropic();
}

// Brand config lives in the Supabase brand_config table (saved by /api/brand).
// The old filesystem path was never populated on Vercel, so prompts silently
// ran on defaults. Cached briefly to avoid a DB query per analyze/generate.
let brandConfigCache: { config: BrandConfig; at: number } | null = null;
const BRAND_CONFIG_TTL_MS = 60_000;

/** Call after writing brand config so this instance picks it up immediately. */
export function invalidateBrandConfigCache() {
  brandConfigCache = null;
}

async function loadBrandConfig(): Promise<BrandConfig> {
  if (brandConfigCache && Date.now() - brandConfigCache.at < BRAND_CONFIG_TTL_MS) {
    return brandConfigCache.config;
  }
  try {
    const config = await getBrandConfig();
    brandConfigCache = { config, at: Date.now() };
    return config;
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

  return analyzeReferenceSplit(client, systemPrompt, imageBase64, mimeType);
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
      // Prefill assistant turn with "{" so Claude is forced to continue with JSON.
      { role: "assistant", content: "{" },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // Prefill ("{" in the previous assistant turn) forces Claude to continue
  // with JSON. The helper handles fences/preamble/postamble/trailing commas.
  const raw = "{" + textContent.text;
  const jsonStr = extractJsonFromClaudeText(raw);
  if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
    throw new Error(`Claude response had no JSON object. Raw: ${raw.slice(0, 200)}`);
  }

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
        content: `Based on this analysis, generate 3-4 copy variations adapted for Bugo:\n\n${JSON.stringify(analysis, null, 2)}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Robust JSON extraction (see claude-json.ts).
  const parsed = JSON.parse(extractJsonFromClaudeText(textContent.text));
  return parsed.copyVariations || parsed;
}
