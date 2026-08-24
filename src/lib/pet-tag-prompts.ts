/**
 * Bugo Pet Tag prompt builders — kept intentionally short and close to the
 * shape of the working `prompts.ts` of the main Bugo flow. Long, verbose
 * translation rules previously caused the model to ADD translations alongside
 * the originals (producing 9+4 mixed-language months). The fix: keep the
 * analyze prompt focused on structure; let the runtime rules in
 * `generate-image/route.ts` enforce language consistency at render time.
 */

import type { Language } from "./types";
import type { PetTagBrandConfig } from "./pet-tag-defaults";

const languageNames: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

const languageDirections: Record<Language, string> = {
  he: "RTL (right-to-left)",
  en: "LTR (left-to-right)",
  ar: "RTL (right-to-left)",
  de: "LTR (left-to-right)",
  ru: "LTR (left-to-right)",
  fr: "LTR (left-to-right)",
};

/** 12 Hebrew month abbreviations — the only ones permitted in the rendered ad. */
const HEBREW_MONTHS = "ינו, פבר, מרץ, אפר, מאי, יוני, יולי, אוג, ספט, אוק, נוב, דצמ";

export function getPetTagAnalysisPrompt(brand: PetTagBrandConfig, language: Language): string {
  const lang = languageNames[language];
  const dir = languageDirections[language];

  const isUSMarket = language === "en" || language === "de" || language === "fr";
  const brandBookText = isUSMarket
    ? (brand.brandBookContentUS || brand.brandBookContent)
    : brand.brandBookContent;
  const pricingBlock = isUSMarket
    ? `${brand.pricingUS.single || "—"} | ${brand.pricingUS.bundle || "—"}`
    : `${brand.pricing.single || "—"} | ${brand.pricing.bundle || "—"}`;

  return `You are a Visual Template Replicator and Ad Adaptation Expert for "${brand.productName}" — a protective pendant for dogs that repels fleas, ticks, and bedbugs.

## YOUR ROLE
Analyze the uploaded reference ad image and produce:
1. A structured analysis of the ad
2. A Nano Banana image generation prompt that replicates the visual EXACTLY with only necessary adaptations
3. 3-4 copy variations adapted for ${brand.productName}

## BRAND KNOWLEDGE
Product: ${brand.productName} — ${brand.productSpecs.technology}
Mechanism: ${brand.productSpecs.mechanism}
Tagline: ${brand.tagline}
Coverage: ${brand.productSpecs.coverage}
Lifespan: ${brand.productSpecs.lifespan}
Safety: ${brand.productSpecs.safety}
Application: ${brand.productSpecs.application}
Pricing: ${pricingBlock}
Pests targeted: ${brand.pestTypes.join(", ")}
Voice & Tone: ${brand.voiceAndTone}

${brandBookText ? `## BRAND BOOK (${isUSMarket ? "US Market" : "Israel Market"})\n${brandBookText}\n` : ""}
${brand.customNotes ? `Additional context: ${brand.customNotes}\n` : ""}

## THE GOLDEN RULE
First, determine the niche of the reference image. Then apply the matching scenario:

### Scenario A: Same Niche (pet care / flea-tick collar / pet protection)
The output must be visually IDENTICAL to the reference image. You are NOT allowed to redesign, reimagine, reinterpret, or "improve" anything visually.
- Replace brand name with "${brand.productName}" — same position, same font style, same size, same color
- Translate/adapt all copy to ${lang}
- Keep every visual element identical
- If the reference shows a different pet-care product, REPLACE it with the ${brand.productName} pendant using the user-uploaded product photo

### Scenario B: Different Niche (any other product category)
If the reference is NOT pet care, replicate the LAYOUT, COMPOSITION, TYPOGRAPHY STYLE, and DESIGN STRUCTURE — but REPLACE niche-specific visual elements with pet-protection equivalents. ZERO traces of the original niche.

**ELEMENT COUNT RULE**: Count the reference's elements (text blocks, images, icons, badges, CTAs). Your output MUST have the SAME count. Do NOT ADD any new elements — only REPLACE.

**WHAT TO REPLACE**:
- Brand name/logo → "${brand.productName}" in clean text only (no graphic elements from original)
- Product images → the ${brand.productName} pendant (user-uploaded photo). Any text printed on the original product packaging is DISCARDED — not converted to data blocks.
- Niche-specific background imagery → pet-relevant equivalents (dogs/cats, paw prints, calm outdoor scenes, shields)
- Niche-specific icons → pet-relevant icons (flea, tick, bedbug, mosquito, paw, shield) IN THE SAME positions
- Before/after concepts → "pet scratching → pet calm"
- Testimonials → pet-owner testimonials

## TEXT — TWO HARD RULES

**Rule 1 — Target language: ${lang} (${dir})**
EVERY visible word in the final image is in ${lang}, except the brand name "${brand.productName}" which stays as-is. When you write the suggestedPrompt, write the ${lang} forms DIRECTLY in the text. Do NOT write English words for the renderer to translate — write the ${lang} version. Examples:
- If reference has English month "JAN", write "ינו" in the suggestedPrompt, NOT "JAN" and NOT "JAN (in Hebrew: ינו)".
- If reference has "Lab Tested", write the ${lang} equivalent — never both.
${language === "he" ? `For 12-month calendar rings: enumerate all 12 months as: ${HEBREW_MONTHS} — in this exact order, in Hebrew only.` : ""}

**Rule 2 — Don't invent copy**
You may use the copy ONLY from this analysis's copyVariations. Do NOT add headlines, sub-headlines, badges, stats, taglines, or CTAs that aren't in the variation. If the reference has 4 text positions and the variation has 2 lines, the output has 2 lines + 2 empty positions — never filler text.

EXCLUDE — DO NOT extract text printed ON the product itself (bag, bottle, box, package). That text disappears when the product is replaced with ${brand.productName}.

## OUTPUT FORMAT (JSON)
{
  "analysis": {
    "layout": "Description of the visual layout and composition",
    "copyFound": ["List of all original text strings found in the image"],
    "copySections": [
      { "label": "headline", "text": "Original headline text" },
      { "label": "sub-headline", "text": "..." }
    ],
    "productPlacement": "Description of where/how the product appears",
    "colorScheme": ["#hex1", "#hex2"],
    "angle": "The marketing angle/emotional hook used",
    "niche": "pet-care" or "other",
    "nicheMapping": "If 'other', explain how the concept maps to ${brand.productName}",
    "referenceHasProduct": true/false,
    "suggestedPrompt": "The complete Nano Banana prompt (see format below)"
  },
  "copyVariations": [
    {
      "id": "var-1",
      "angle": "e.g., toxic-free protection",
      "sections": [
        {
          "id": "s1",
          "label": "headline",
          "originalText": "Original text from reference",
          "adaptedText": "Adapted ${lang} text for ${brand.productName} — natural, grammatical, no filler"
        }
      ]
    }
  ]
}

VARIATION 1 (var-1) MUST be a near-exact adaptation of the reference: same angle, same hook, same CTA style. Only change brand name and translate to ${lang}.
VARIATIONS 2-4: Different marketing angles.

## NANO BANANA PROMPT FORMAT
The "suggestedPrompt" must be DENSE, not long: 400-700 words. Every sentence
carries a concrete instruction — an exact hex code, a position, a font weight, a
quoted string. Cut restatements and anything a renderer cannot act on. Include:

1. **Opening**:
   - Same niche: "REPLICATE THE REFERENCE EXACTLY. Only changes: (1) replace brand with '${brand.productName}', (2) all visible text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
   - Different niche: "REPLICATE layout / composition / typography / colors. ADAPT visuals to pet protection. Brand: '${brand.productName}'. Text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
2. **BACKGROUND**: exact gradient / colors with hex codes / direction
3. **EVERY TEXT ELEMENT** described separately top-to-bottom — exact ${lang} text in quotes, font, color hex, position. If reference has a 12-month calendar ring, list all 12 ${language === "he" ? `Hebrew months in order: ${HEBREW_MONTHS}` : `${lang} months in order"`}.
4. **PRODUCT**:
   - ${brand.productName} is a small pendant that clips onto a dog collar.
   - If a product photo is provided as a second reference image, use that exact image — pixel-perfect copy.
   - NEVER overlay marketing text on top of the pendant.
5. **ICONS / CTAs**: in ${lang}, in same positions as reference
6. **ASPECT RATIO**: 1:1 or 9:16 (will be set by API; mention briefly)
7. **CLOSING**: "Render ONLY the text described above; nothing else. Every word in ${lang}."

## COPY QUALITY
- Use ONLY verified brand facts from the brand knowledge above
- Never invent claims
- Match original text hierarchy
- Natural, grammatical ${lang} — no random word strings
- Variation 1 = faithful adaptation; Variations 2-4 = creative angle exploration`;
}

/**
 * Per-image runtime rules block. KEPT SHORT — the model performs better with
 * a few sharp imperatives than many verbose paragraphs.
 *
 * The full rules orchestration (whitelist, size, etc.) is built in
 * `src/app/api/pet-tag/generate-image/route.ts`. This function only contributes
 * the product-replacement and product-fidelity rules.
 */
export function getPetTagProductRules(brand: PetTagBrandConfig, hasProductImage: boolean): string[] {
  const rules: string[] = [];

  if (hasProductImage) {
    rules.push(`CRITICAL — ${brand.productName.toUpperCase()} IS NOT THE INDOOR BUGO DEVICE:
The brand name "${brand.productName}" contains the word "Bugo" — this is intentional and shares branding with another Bugo product line. However, ${brand.productName} is a COMPLETELY DIFFERENT PRODUCT from any other Bugo device you may have seen in training data or in the LAYOUT REFERENCE below.

${brand.productName} is a small protective pendant designed to clip onto a dog's collar. It is NOT:
- A white oval ultrasonic device
- A flat disc or puck-shaped electronic device
- A plug-in wall device
- A speaker, repeller, or any electronics that sit on a desk/floor/socket

If the reference image (Image 1) shows or implies any "Bugo" indoor ultrasonic device, IGNORE that — for this generation, "Bugo" refers ONLY to ${brand.productName} = the pendant in Image 2.

Your ONLY visual source for what ${brand.productName} looks like is Image 2. Do not rely on prior knowledge of "Bugo". Do not render anything from training data about "Bugo". If Image 2 shows a green pendant on a dog collar, that is the product. If Image 2 shows just the pendant alone, that is the product. Whatever Image 2 shows is the entirety of what ${brand.productName} looks like.`);

    rules.push(`PRODUCT — IMAGE 2 IS THE EXACT PRODUCT (ONE INSTANCE ONLY):
You receive TWO images. Image 1 = the reference ad layout. Image 2 = the EXACT ${brand.productName} product the user chose for this generation.

Image 2 is the COMPLETE product representation. Whatever Image 2 shows is the final product appearance — whether Image 2 is the pendant alone, the pendant on a dog's collar, the packaging, or any other framing the user chose.

Placement rule — the product appears EXACTLY ONCE in your output:
- If Image 1 (the reference) already contains the ${brand.productName} product naturally (e.g., a dog wearing the pendant on its collar), USE the imagery as-is. Do NOT add a second pendant elsewhere on the canvas — not on the dog's chest, not as a corner badge, not as a decorative element.
- If Image 1 contains a competitor pet-care product (bottle, dropper, spray, collar, sachet, box), REMOVE the competitor entirely and place Image 2 in that single position. Still just ONE instance.
- If Image 1 has no visible product, render Image 2 in a natural position consistent with the layout. Still just ONE instance.

FORBIDDEN: adding extra pendants, additional product graphics, duplicate copies of the product, or "decorative" Image 2 elements (round badge in corner, secondary pendant on chest, etc.). The image contains the product ONCE — wherever the reference naturally places it.

Any text printed on competitor packaging in Image 1 is DISCARDED — never transcribed onto the canvas.`);

    rules.push(`${brand.productName.toUpperCase()} VISUAL FIDELITY — STRICT:
The product in your output MUST look identical to Image 2 in EVERY visual aspect:
- Same shape (do NOT render it as a round badge, a square box, a circular pill, or any other geometric form that is not what Image 2 shows)
- Same color and material finish
- Same proportions and size relative to its surroundings
- Same clip / attachment / strap / collar mechanism (if any) shown in Image 2
- Same logo/branding placement on the product face

DO NOT redraw, redesign, reimagine, mirror, flip, or "improve" the product. DO NOT generate alternative interpretations. If you cannot reproduce Image 2 exactly, leave a clean placeholder space rather than inventing a different-looking product. Across all aspect ratios (1:1 and 9:16), the product appears IDENTICAL — same shape, same color, same orientation.`);

    rules.push(`NO TEXT ON PRODUCT:
NEVER place ANY marketing text, headline, stat, copy, or promotional text ON TOP of the ${brand.productName} product itself. The ONLY text on the product is its built-in branding from Image 2. All marketing copy goes on the background/canvas, never overlapping the product image.`);
  }

  return rules;
}
