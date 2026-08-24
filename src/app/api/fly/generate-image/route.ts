import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import path from "path";
import {
  resolveProductFile,
  resolveProductFileById,
  type ProductScope,
} from "@/lib/productImages";
import { loadFlyBrandConfig } from "@/lib/fly-claude";
import { getFlyProductRules } from "@/lib/fly-prompts";
import type { Language } from "@/lib/types";

// A Claude vision call with max_tokens 8192 takes 20-60s. Without this, Vercel
// uses its default function limit (10s on Hobby) and kills the request, handing
// the browser an HTML error page instead of JSON. 60 is the Hobby ceiling and is
// valid on Pro too; raise to 300 on Pro if analyses still get cut off.
export const maxDuration = 60;


const PRODUCT_SCOPE: ProductScope = "fly";

const HEBREW_MONTHS = "ינו, פבר, מרץ, אפר, מאי, יוני, יולי, אוג, ספט, אוק, נוב, דצמ";

const LANGUAGE_DISPLAY: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      referenceImageUrl,
      /** Array of product image IDs to use (mirrors main Bugo flow). */
      productImageIds,
      size = "1:1",
      copyVariation,
      enhancedVariationMatching,
      includeProduct = true,
      isCrossSize = false,
      enforceCleanLayout = true,
      language = "he" as Language,
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const brand = await loadFlyBrandConfig();
    let finalPrompt = prompt;

    let publicRefUrl: string | undefined;
    if (referenceImageUrl?.startsWith("/api/fly/products/file/")) {
      const filename = referenceImageUrl.split("/").pop()!;
      const filepath = await resolveProductFile(PRODUCT_SCOPE, filename);
      if (filepath) publicRefUrl = await uploadToPublicHost(filepath);
    } else if (referenceImageUrl?.startsWith("/api/upload/file/")) {
      const filename = referenceImageUrl.split("/").pop()!;
      const filepath = path.join(process.cwd(), "uploads", "references", filename);
      publicRefUrl = await uploadToPublicHost(filepath);
    } else if (referenceImageUrl?.startsWith("http")) {
      publicRefUrl = referenceImageUrl;
    }

    // Upload first product image to public host (array form for main-Bugo parity).
    let publicProductUrl: string | undefined;
    if (!isCrossSize && includeProduct && Array.isArray(productImageIds) && productImageIds.length > 0) {
      try {
        const filepath = await resolveProductFileById(PRODUCT_SCOPE, productImageIds[0]);
        if (filepath) {
          publicProductUrl = await uploadToPublicHost(filepath);
        }
      } catch {
        // No product image found — continue without
      }
    }

    console.log("=== FLY GENERATE IMAGE DEBUG ===");
    console.log("Prompt:", prompt?.substring(0, 300));
    console.log("Public ref URL:", publicRefUrl);
    console.log("Public product URL:", publicProductUrl);
    console.log("Size:", size);
    console.log("Language:", language);
    console.log("=== END DEBUG ===");

    if (enforceCleanLayout && !isCrossSize) {
      const rules: string[] = [];
      const langName = LANGUAGE_DISPLAY[language as Language] || "Hebrew";

      let copyBlock = "";
      if (copyVariation?.sections?.length) {
        const nonEmpty = copyVariation.sections.filter(
          (s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()
        );
        copyBlock = nonEmpty
          .map((s: { label: string; adaptedText: string }) => `${s.label}: "${s.adaptedText}"`)
          .join("\n");
      }

      // === Rule 1: CONTENT WHITELIST ===
      if (copyBlock) {
        rules.push(`CONTENT WHITELIST — RENDER ALL OF THESE, AND ONLY THESE (variation: ${copyVariation.angle}):
${copyBlock}

Two-sided rule:
(a) EVERY line above MUST appear in the rendered image. Skipping any whitelisted line is a CRITICAL FAILURE. If portrait canvas vs square reference, REARRANGE positions but never DROP a line.
(b) Text NOT on this list MUST be omitted. Do NOT invent placeholders, badges, stats, sub-headlines, ratings, or filler copy.

Same rule for VISUAL DECORATIONS — not just text. MUST NOT be added unless they appear in the reference:
- Round trust badges or seal-style graphics
- Additional product devices placed anywhere on the canvas
- Decorative circles, stamps, ribbons
- Any duplicate of the product (appears exactly ONCE)

Final count: total visible text strings = exactly ${(copyVariation.sections || []).filter((s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()).length}.`);
      }

      // === Rule 2: TEXT LANGUAGE ===
      const langRule = `TEXT LANGUAGE: ${langName}.
Render ZERO English text. The ONLY exception is the brand name "${brand.productName}".${
        language === "he"
          ? `

For any 12-month calendar ring, render EXACTLY these 12 Hebrew abbreviations in order: ${HEBREW_MONTHS}.
FORBIDDEN tokens: JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC. REPLACE — do NOT render both versions. Total = exactly 12 in Hebrew (or 0).`
          : ""
      }
For any other English label, badge, day name, or month name in the reference, replace it with the ${langName} equivalent — never render both.`;
      rules.push(langRule);

      // === Rule 3: HEBREW TYPOGRAPHY ===
      if (language === "he") {
        rules.push(`HEBREW TYPOGRAPHY:
Render Hebrew text exactly letter-for-letter from the whitelist. Do NOT invent letters, drop letters, or rearrange syllables. Each whitelisted phrase = non-translatable string template.`);
      }

      // === Rule 4: RENDER SIZE ===
      rules.push(`RENDER SIZE — final output aspect ratio is "${size}".
${
        size === "1:1"
          ? "Perfectly SQUARE — width equals height. NOT portrait, NOT landscape, NOT 9:16."
          : "PORTRAIT 9:16 ratio. NOT square, NOT 1:1."
      }
This overrides any aspect-ratio mention inside the LAYOUT REFERENCE.`);

      // === Rule 5: PRODUCT (replace or preserve) ===
      if (publicProductUrl) {
        rules.push(...getFlyProductRules(brand, true));
      } else {
        rules.push(`NO PRODUCT ADDITION (no product image was provided):
The user did NOT select a ${brand.productName} product image. The original reference imagery must be preserved EXACTLY — including any product, hand, scene, and background. DO NOT add ANY product:
- DO NOT add a ${brand.productName} device
- DO NOT add the white/oval Bugo Indoor ultrasonic device (you may have this in training data — do not render it)
- DO NOT add any other Bugo-branded product, badge, or device
- DO NOT remove or replace any item already in the reference
- DO NOT add new visual elements (icons, badges, calendars, rings, frames) not in the reference

The ONLY permitted change is text — the copy from the whitelist above. Visual content stays 100% identical to the reference.`);
      }

      // === Rule 6: VISUAL MATCHING ===
      if (copyBlock && enhancedVariationMatching) {
        rules.push(`VISUAL MATCHING:
Illustrations and depicted subjects (mosquitoes, flies, peaceful family, sleeping baby) must reinforce the variation "${copyVariation.angle}".`);
      }

      const rulesBlock = `ABSOLUTE RULES — VIOLATING ANY = TASK FAILURE:\n\n${rules
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n\n")}\n\n---\n\n`;

      const whitelistCount = (copyVariation?.sections || []).filter(
        (s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()
      ).length;
      const finalReminder = copyBlock
        ? `\n\n---\n\n=== FINAL REMINDER — RENDER EXACTLY THESE ${whitelistCount} TEXT STRINGS ===\n${copyBlock}\n\nTwo-sided: (a) every line MUST appear regardless of aspect ratio. (b) Text NOT on list MUST be omitted.${
            publicProductUrl
              ? `\n\nProduct check: ${brand.productName} appears in your output exactly as in Image 2 — same shape, color, proportions.`
              : `\n\nImagery check: original reference imagery is preserved — no ${brand.productName} product was added.`
          }${
            language === "he"
              ? `\nLanguage check: every visible word is Hebrew (except brand "${brand.productName}"). Months — if any — are EXACTLY: ${HEBREW_MONTHS}.`
              : ""
          }`
        : "";

      finalPrompt = `${rulesBlock}LAYOUT REFERENCE (composition guidance only — actual rendered content is governed by the rules above):\n\n${prompt}${finalReminder}`;
    }

    const result = await submitGeneration({
      prompt: finalPrompt,
      referenceImageUrl: publicRefUrl,
      productImageUrl: publicProductUrl,
      size,
    });

    return NextResponse.json({ jobId: result.jobId });
  } catch (error) {
    console.error("Fly generate image error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
