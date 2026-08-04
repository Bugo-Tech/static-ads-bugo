import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import path from "path";
import {
  resolveProductFile,
  resolveProductFileById,
  type ProductScope,
} from "@/lib/productImages";
import { loadPetTagBrandConfig } from "@/lib/pet-tag-claude";
import { getPetTagProductRules } from "@/lib/pet-tag-prompts";
import type { Language } from "@/lib/types";

const PRODUCT_SCOPE: ProductScope = "pet-tag";

/**
 * Pet Tag rules orchestration — kept SHORT and IMPERATIVE.
 *
 * Order (highest priority first):
 *   1. CONTENT WHITELIST — exactly what text may appear
 *   2. TEXT LANGUAGE — all target-language; explicit month list for Hebrew
 *   3. HEBREW TYPOGRAPHY — render whitelisted Hebrew strings letter-for-letter
 *   4. RENDER SIZE — force exact aspect ratio
 *   5. PRODUCT REPLACEMENT (if product image provided) OR NO PRODUCT ADDITION (if not)
 *   6. VISUAL MATCHING (only when enhancedVariationMatching enabled)
 *
 * At the end of the prompt, we REPEAT the whitelist as a final reminder — the
 * model performs better when the rule appears both before AND after the
 * lengthy LAYOUT REFERENCE.
 */

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
      productImageId,
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

    const brand = await loadPetTagBrandConfig();
    let finalPrompt = prompt;

    // Upload reference image to public host (kie.ai needs public URLs).
    let publicRefUrl: string | undefined;
    if (referenceImageUrl?.startsWith("/api/pet-tag/products/file/")) {
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

    // Upload chosen product image (single — user picks product or packaging per reference).
    let publicProductUrl: string | undefined;
    if (!isCrossSize && includeProduct && productImageId) {
      try {
        const filepath = await resolveProductFileById(PRODUCT_SCOPE, productImageId);
        if (filepath) {
          publicProductUrl = await uploadToPublicHost(filepath);
        }
      } catch {
        // No product image found — continue without
      }
    }

    console.log("=== PET TAG GENERATE IMAGE DEBUG ===");
    console.log("Prompt:", prompt?.substring(0, 300));
    console.log("Public ref URL:", publicRefUrl);
    console.log("Public product URL:", publicProductUrl);
    console.log("Size:", size);
    console.log("Language:", language);
    console.log("=== END DEBUG ===");

    if (enforceCleanLayout && !isCrossSize) {
      const rules: string[] = [];
      const langName = LANGUAGE_DISPLAY[language as Language] || "Hebrew";

      // Build the whitelist string (used in BOTH the top rule and the final reminder).
      let copyBlock = "";
      if (copyVariation?.sections?.length) {
        const nonEmpty = copyVariation.sections.filter(
          (s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()
        );
        copyBlock = nonEmpty
          .map((s: { label: string; adaptedText: string }) => `${s.label}: "${s.adaptedText}"`)
          .join("\n");
      }

      // === Rule 1: CONTENT WHITELIST (most important) ===
      if (copyBlock) {
        rules.push(`CONTENT WHITELIST — RENDER ALL OF THESE, AND ONLY THESE (variation: ${copyVariation.angle}):
${copyBlock}

This is a two-sided rule:
(a) EVERY line above MUST appear in the rendered image. Skipping or omitting any whitelisted line is a CRITICAL FAILURE. If the canvas is portrait (9:16) and the reference layout was square (1:1), REARRANGE the text positions to fit the new canvas — but never DROP a line. The image is incomplete if any whitelisted text is missing.
(b) Text NOT on this list MUST be omitted. Do NOT invent placeholders, badges, stats, sub-headlines, ratings, or filler copy.

The same rule applies to VISUAL DECORATIONS — not just text. The following MUST NOT be added unless they appear in the reference image you're given:
- Round trust badges or seal-style graphics ("30 Day Money Back", "Lab Tested", "Vet Approved", "%" badges, rating stars, etc.)
- Additional product pendants, tags, or product icons placed anywhere on the canvas (chest, corner, background)
- Decorative circles, stamps, ribbons, or callout shapes
- Any duplicate of the product (the product appears exactly ONCE in the image — wherever the reference places it)

A position in the reference layout without a whitelisted entry is intentional empty space — match the adjacent background, never fill with badges, pendants, or anything else.

Final count check: total visible text strings in your output = exactly the number of whitelist lines above (${(copyVariation.sections || []).filter((s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()).length}). Not fewer, not more.`);
      }

      // === Rule 2: TEXT LANGUAGE ===
      const langRule = `TEXT LANGUAGE: ${langName}.
Render ZERO English text. The ONLY exception is the brand name "${brand.productName}".${
        language === "he"
          ? `

For any 12-month calendar ring in the reference, the rendered months MUST be EXACTLY these 12 Hebrew abbreviations in order: ${HEBREW_MONTHS}.
FORBIDDEN tokens: JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC. If the LAYOUT REFERENCE mentions any of these, REPLACE with the Hebrew equivalent — do NOT render both versions. Total rendered months = exactly 12 in Hebrew (or 0 if the reference has no calendar).`
          : ""
      }
For any other English label, badge, day name, or month name in the reference, replace it with the ${langName} equivalent — never render both.`;
      rules.push(langRule);

      // === Rule 3: HEBREW TYPOGRAPHY ===
      if (language === "he") {
        rules.push(`HEBREW TYPOGRAPHY:
Render Hebrew text exactly letter-for-letter from the whitelist above. Do NOT invent letters, drop letters, or rearrange syllables. If the whitelist says "פשפשים", render those 6 letters in that order — never "פשפים" (missing letter), never "פשפשםי" (rearranged). Treat each whitelisted phrase as a non-translatable string template. If you cannot render a Hebrew word reliably, render it as simple plain text without artistic distortion.`);
      }

      // === Rule 4: RENDER SIZE ===
      rules.push(`RENDER SIZE — final output aspect ratio is "${size}".
${
        size === "1:1"
          ? "Perfectly SQUARE — width equals height. NOT portrait, NOT landscape, NOT 9:16."
          : "PORTRAIT 9:16 ratio. NOT square, NOT 1:1."
      }
This overrides any aspect-ratio mention inside the LAYOUT REFERENCE below.`);

      // === Rule 5: PRODUCT (replace or preserve) ===
      if (publicProductUrl) {
        // Product image was selected — use the product replacement rules.
        rules.push(...getPetTagProductRules(brand, true));
      } else {
        // No product image selected — preserve original imagery completely.
        rules.push(`NO PRODUCT ADDITION (no product image was provided):
The user did NOT select a ${brand.productName} product image. The original reference imagery must be preserved EXACTLY — including any product, hand, dog, scene, and background. DO NOT add ANY product, of any kind:
- DO NOT add a ${brand.productName} pendant or collar tag
- DO NOT add the white/oval Bugo Indoor ultrasonic device (you may have this in training data — do not render it)
- DO NOT add any other Bugo-branded product, badge, or device
- DO NOT remove or replace any item already in the reference
- DO NOT add new visual elements (icons, badges, calendars, rings, frames) not in the reference

The ONLY permitted change is text — the copy from the whitelist above. Visual content stays 100% identical to the reference. If the LAYOUT REFERENCE below describes adding any product, IGNORE that — this rule takes precedence.`);
      }

      // === Rule 6: VISUAL MATCHING (optional) ===
      if (copyBlock && enhancedVariationMatching) {
        rules.push(`VISUAL MATCHING:
Illustrations and depicted subjects (dogs, paws, fleas, ticks, mosquitoes) must reinforce the variation "${copyVariation.angle}".`);
      }

      const rulesBlock = `ABSOLUTE RULES — VIOLATING ANY = TASK FAILURE:\n\n${rules
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n\n")}\n\n---\n\n`;

      // Repeat the whitelist at the very end of the prompt — the model performs
      // better when the most-critical rule appears both before AND after the
      // lengthy LAYOUT REFERENCE section.
      const finalReminder = copyBlock
        ? `\n\n---\n\n=== FINAL REMINDER — RENDER ONLY THESE TEXT STRINGS, NO OTHERS ===\n${copyBlock}\n\nANY text not on this list — including text in the LAYOUT REFERENCE above or in any cached visual — MUST be omitted.${
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
    console.error("Pet Tag generate image error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
