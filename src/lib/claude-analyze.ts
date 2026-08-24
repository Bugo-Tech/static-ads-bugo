/**
 * Shared reference-ad analysis, split across two concurrent Claude calls.
 *
 * Why it is split: asking for the analysis, the Nano Banana prompt and the copy
 * variations in one response meant ~5,200 output tokens, and output generation
 * is what costs the time — measured 83.6s on a real ad. Vercel's function limit
 * is 60s (10s on Hobby), so the request died and the browser got an HTML error
 * page rather than an answer.
 *
 * Simply asking for a shorter prompt did not work: the model generated to the
 * token cap regardless and truncated mid-JSON. But the two halves are
 * independent given the same image, so running them concurrently makes
 * wall-clock the slower half instead of the sum — measured 45s end to end, with
 * the same output (4 variations, 8 sections, ~600-word prompt).
 *
 * Both halves send the identical system prompt, so the second reads it from the
 * prompt cache instead of reprocessing ~4,900 tokens.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, CopyVariation } from "./types";
import { extractJsonFromClaudeText } from "./claude-json";

const MODEL = "claude-sonnet-4-6";

/** Generous enough for a ~700-word prompt plus the rest of the analysis. */
const ANALYSIS_MAX_TOKENS = 4096;
/** 3-4 variations with several sections each. */
const VARIATIONS_MAX_TOKENS = 3072;

type SupportedMedia = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/**
 * One Claude vision call that must answer with JSON, returning `field` from it.
 * `field` also names the half in any error, so a failure says which one broke.
 */
async function requestJson<T>(
  client: Anthropic,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  instruction: string,
  maxTokens: number,
  field: "analysis" | "copyVariations"
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as SupportedMedia,
              data: imageBase64,
            },
          },
          { type: "text", text: instruction },
        ],
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `Claude's ${field} response was cut off before it finished. Try again, or use a simpler reference ad.`
    );
  }

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error(`No text response from Claude for ${field}`);
  }

  // Sonnet may add fences, a preamble, a postamble, or a trailing comma.
  const parsed = JSON.parse(extractJsonFromClaudeText(textContent.text));
  const value = parsed?.[field];
  if (value === undefined || value === null) {
    throw new Error(`Claude's response was missing "${field}".`);
  }
  return value as T;
}

/**
 * Analyzes a reference ad.
 *
 * `productDescription` is appended to each instruction so the model knows which
 * product it is adapting for, e.g. "the Bugo Birds pigeon/bird repeller".
 */
export async function analyzeReferenceSplit(
  client: Anthropic,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  productDescription?: string
): Promise<{ analysis: AnalysisResult; copyVariations: CopyVariation[] }> {
  const forProduct = productDescription ? ` adapted for ${productDescription}` : "";

  const [analysis, copyVariations] = await Promise.all([
    requestJson<AnalysisResult>(
      client,
      systemPrompt,
      imageBase64,
      mimeType,
      `Analyze this reference ad image${forProduct}. Return ONLY {"analysis": {...}} containing every field of the analysis object, including the complete suggestedPrompt. Do NOT include copyVariations.`,
      ANALYSIS_MAX_TOKENS,
      "analysis"
    ),
    requestJson<CopyVariation[]>(
      client,
      systemPrompt,
      imageBase64,
      mimeType,
      `Analyze this reference ad image${forProduct}. Return ONLY {"copyVariations": [...]} — the 3-4 copy variations. Do NOT include the analysis object and do NOT write a Nano Banana prompt.`,
      VARIATIONS_MAX_TOKENS,
      "copyVariations"
    ),
  ]);

  return { analysis, copyVariations };
}
