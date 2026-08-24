/**
 * Bugo Guard prompts — focused on essential-oil sachets that repel mice and
 * rodents. Tight, focused instructions; runtime rules in
 * src/app/api/guard/generate-image/route.ts handle language consistency and
 * product-fidelity enforcement.
 *
 * IMPORTANT — how this vertical differs from the others: Ants, Birds, Fly and
 * Pet Tag are all electronic devices that mount on a wall or plug into power.
 * Guard is a flat sachet placed inside a closed cabinet. Every rule below that
 * describes the physical product is written for a sachet on purpose; do not
 * copy device vocabulary (speaker grille, LED, plug, mounting bracket) in from
 * the other verticals' prompt files.
 */

import type { Language } from "./types";
import type { GuardBrandConfig } from "./guard-defaults";

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

const HEBREW_MONTHS = "ינו, פבר, מרץ, אפר, מאי, יוני, יולי, אוג, ספט, אוק, נוב, דצמ";

export function getGuardAnalysisPrompt(brand: GuardBrandConfig, language: Language): string {
  const lang = languageNames[language];
  const dir = languageDirections[language];

  const isUSMarket = language === "en" || language === "de" || language === "fr";
  const brandBookText = isUSMarket
    ? (brand.brandBookContentUS || brand.brandBookContent)
    : brand.brandBookContent;
  const pricingBlock = isUSMarket
    ? `${brand.pricingUS.single || "—"} | ${brand.pricingUS.bundle || "—"}`
    : `${brand.pricing.single || "—"} | ${brand.pricing.bundle || "—"}`;

  return `You are a Visual Template Replicator and Ad Adaptation Expert for "${brand.productName}" — essential-oil sachets that repel mice and rodents. This is NOT an electronic device: it is a small, flat scented pouch placed inside an enclosed space.

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

### Scenario A: Same Niche (rodent / mouse / rat control — repellent pouches or sachets, snap traps, glue boards, bait stations, poison pellets, ultrasonic rodent plug-ins, peppermint-oil sprays, steel-wool gap fillers)
The output must be visually IDENTICAL to the reference image.
- Replace brand name with "${brand.productName}" — same position, same font style, same size, same color
- Translate/adapt all copy to ${lang}
- Keep every visual element identical
- Replace the original product image with the user-uploaded ${brand.productName} product photo (Image 2)

### Scenario B: Different Niche (any other product category)
If the reference is NOT a rodent-control product, replicate the LAYOUT, COMPOSITION, TYPOGRAPHY STYLE, COLORS — but REPLACE niche-specific visuals with rodent-protection equivalents. ZERO traces of the original niche.

**ELEMENT COUNT RULE**: Count the reference's elements (text blocks, images, icons, badges, CTAs). Your output MUST have the SAME count. Do NOT ADD any new elements — only REPLACE.

**WHAT TO REPLACE**:
- Brand name/logo → "${brand.productName}" in clean text only (no graphic elements from original)
- Product images → the ${brand.productName} sachet (user-uploaded photo, Image 2). Any text printed on the original product packaging is DISCARDED.
- Niche-specific background imagery → rodent-relevant equivalents (a tidy kitchen cabinet interior, a pantry shelf with sealed food, a sachet tucked beside stored goods, a garage or storage room, an RV/car interior, a calm family kitchen in the AFTER state)
- Niche-specific icons → relevant icons (mouse silhouette, "no" symbol over a mouse, leaf or plant sprig, peppermint leaf, shield, house outline, checkmark, cabinet or drawer icon)
- Before/after concepts → "before = droppings on a shelf / gnawed food packaging / chewed wires → after = clean sealed pantry / intact packaging / a sachet quietly doing its job"
- Testimonials → homeowner / parent / pet-owner / RV-owner testimonials about a chemical-free home, no traps to empty, and food storage that finally stays untouched

**TASTE RULE — IMPORTANT**: This product is sold to people who are disgusted by rodents. Do NOT render gory, dead, injured or grotesque animals, blood, or bodies in traps. If the reference does that, replace it with the clean/protected AFTER state instead. Live mice, if shown at all, are small, incidental, and non-graphic — the hero is the protected home, not the pest.

## TEXT — TWO HARD RULES

**Rule 1 — Target language: ${lang} (${dir})**
EVERY visible word in the final image is in ${lang}, except the brand name "${brand.productName}" which stays as-is. When you write the suggestedPrompt, write the ${lang} forms DIRECTLY in the text. Do NOT write English words for the renderer to translate — write the ${lang} version. Examples:
- If reference has English month "JAN", write "ינו" in the suggestedPrompt, NOT "JAN" and NOT "JAN (in Hebrew: ינו)".
- If reference has "Lab Tested", write the ${lang} equivalent — never both.
${language === "he" ? `For 12-month calendar rings: enumerate all 12 months as: ${HEBREW_MONTHS} — in this exact order, in Hebrew only.` : ""}

**Rule 2 — Don't invent copy**
You may use the copy ONLY from this analysis's copyVariations. Do NOT add headlines, sub-headlines, badges, stats, taglines, or CTAs that aren't in the variation. If the reference has 4 text positions and the variation has 2 lines, the output has 2 lines + 2 empty positions — never filler text.

EXCLUDE — DO NOT extract text printed ON the product itself (bag, bottle, box, package, pouch). That text disappears when the product is replaced with ${brand.productName}.

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
    "niche": "rodent" or "other",
    "nicheMapping": "If 'other', explain how the concept maps to ${brand.productName}",
    "referenceHasProduct": true/false,
    "suggestedPrompt": "The complete Nano Banana prompt (see format below)"
  },
  "copyVariations": [
    {
      "id": "var-1",
      "angle": "e.g., a chemical-free home that stays protected",
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
VARIATIONS 2-4: Different marketing angles (safe around kids and pets / no traps and no bodies to clean up / protects cabinets, pantry, storage and the car / 12 sachets, no electricity, no installation).

## NANO BANANA PROMPT FORMAT
The "suggestedPrompt" must be DENSE, not long: 400-700 words. Every sentence
carries a concrete instruction — an exact hex code, a position, a font weight, a
quoted string. Cut restatements and anything a renderer cannot act on. Include:

1. **Opening**:
   - Same niche: "REPLICATE THE REFERENCE EXACTLY. Only changes: (1) replace brand with '${brand.productName}', (2) all visible text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
   - Different niche: "REPLICATE layout / composition / typography / colors. ADAPT visuals to rodent protection. Brand: '${brand.productName}'. Text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
2. **BACKGROUND**: exact gradient / colors with hex codes / direction
3. **EVERY TEXT ELEMENT** described separately top-to-bottom — exact ${lang} text in quotes, font, color hex, position. If reference has a 12-month calendar ring, list all 12 ${language === "he" ? `Hebrew months in order: ${HEBREW_MONTHS}` : `${lang} months in order"`}.
4. **PRODUCT**:
   - ${brand.productName} ships as a resealable stand-up foil POUCH in Bugo blue, carrying the white "bugo" wordmark, holding 12 individual SACHETS. Each sachet is a small flat white non-woven pillow printed with the blue "bugo" logo. Ads may show the retail pouch, a single sachet, or the pouch with a sachet beside it.
   - It is NOT an electronic device — no plug, no cable, no battery, no speaker, no LED, no buttons, no vents, no mounting bracket. Never draw one.
   - If a product photo is provided as a second reference image (Image 2), use that exact image — pixel-perfect copy. Image 2 always wins over this description.
   - NEVER overlay marketing text on top of the pouch or the sachet.
5. **RODENT / HOME VISUALS** — be specific:
   - The sachet sits INSIDE an enclosed space: a kitchen cabinet, under a sink, a pantry shelf, a drawer, a storage box, a garage shelf, an attic corner, a car engine bay, an RV compartment. It is never mounted on a wall, hung outdoors, or installed like a device.
   - Mice, if depicted at all: small, ordinary house mice, realistic, alive and unharmed, kept incidental and non-graphic. No rats snarling, no gore, no corpses, no animals in traps.
   - Evidence of the problem: gnawed food packaging, a torn rice or pasta bag, small droppings on a shelf, chewed wiring — documentary-style, not cartoonish.
   - Kitchens, pantries, storage rooms and garages typical of Israeli or Western homes.
   - BEFORE state: contaminated, unsettling, out of control
   - AFTER state: clean, sealed, calm, safe for the family
6. **ICONS / CTAs**: in ${lang}, in same positions as reference
7. **ASPECT RATIO**: 1:1 or 9:16 (will be set by API; mention briefly)
8. **CLOSING**: "Render ONLY the text described above; nothing else. Every word in ${lang}."

## COPY QUALITY
- Use ONLY verified brand facts from the brand knowledge above
- Never invent claims (no "100% guaranteed", no "kills mice" — ${brand.productName} REPELS, never harms). Do not claim it resolves an existing active infestation; the brand's own position is that an active infestation needs professional treatment.
- Match original text hierarchy
- Natural, grammatical ${lang} — no random word strings
- Variation 1 = faithful adaptation; Variations 2-4 = creative angle exploration`;
}

/**
 * Per-image runtime product rules.
 */
export function getGuardProductRules(brand: GuardBrandConfig, hasProductImage: boolean): string[] {
  const rules: string[] = [];

  if (hasProductImage) {
    rules.push(`CRITICAL — ${brand.productName.toUpperCase()} IS A DEDICATED PRODUCT:
The brand name "${brand.productName}" contains the word "Bugo" — this is intentional and shares branding with other Bugo product lines. However, ${brand.productName} is a SPECIFIC PRODUCT: an essential-oil SACHET for repelling mice and rodents. Your ONLY visual source for what ${brand.productName} looks like is Image 2.

Do not rely on prior knowledge of "Bugo" from training data. Other Bugo products are electronic repeller devices — ${brand.productName} is NOT one of them. Do not render a plug-in unit, an ultrasonic box, a speaker, an LED or any electronic housing. Whatever Image 2 shows is the entirety of what ${brand.productName} looks like — use that exact appearance.`);

    rules.push(`COMPLETE COMPETITOR ERASURE — NO RESIDUAL BRANDING:
The reference image (Image 1) likely contains a competitor product such as "SoFyre", "PestLab", or another branded rodent-repellent pouch, trap, bait station or ultrasonic plug-in. Wherever that competitor product appears in Image 1:

1. The PHYSICAL PRODUCT (shape, color, material, form factor) is REPLACED entirely by Image 2's sachet. Do NOT keep the original product's shape — Image 2 has its own shape and that is what appears in the output.
2. The BRAND TEXT on the product ("SoFyre", "PestLab", or any other competitor brand name printed on the pouch, box or label) is COMPLETELY ERASED — it does not appear anywhere in your output. The only branding on the product face is Image 2's own built-in branding.
3. Any PRODUCT-SPECIFIC visual features (pouch proportions, mesh or paper texture, drawstring, printed label artwork, box design) come from IMAGE 2, not Image 1. Do not preserve features from Image 1's product.

ABSOLUTELY FORBIDDEN — these are CRITICAL FAILURES:
- Rendering the competitor's pouch shape/silhouette with Image 2's branding swapped in
- Rendering Image 2's shape but keeping the competitor's brand text ("SoFyre" alongside "${brand.productName}")
- A HYBRID product that combines the competitor's pouch with Image 2's coloring or vice versa
- Two brand names on one product (e.g., "SoFyre ${brand.productName}")
- ANY occurrence of the word "SoFyre", "PestLab", or any competitor brand name anywhere in the output (on the product, in the background, or in text blocks)

The output's product is 100% Image 2, 0% Image 1's product. The competitor brand is fully gone — its name, its silhouette, its color scheme, its features — all replaced by Image 2's appearance.`);

    rules.push(`PRODUCT — IMAGE 2 IS THE EXACT PRODUCT (ONE PRESENTATION ONLY):
You receive TWO images. Image 1 = the reference ad layout. Image 2 = the EXACT ${brand.productName} product the user chose for this generation.

Placement rule — the product appears as EXACTLY ONE presentation in your output:
- If Image 1 (the reference) contains a competitor rodent product (repellent pouch, snap trap, glue board, bait station, poison pellets, ultrasonic plug-in, spray bottle), REMOVE the competitor entirely (product + brand text + all its visual features per the COMPETITOR ERASURE rule above) and place Image 2 in that single position.
- If Image 1 has no visible product, render Image 2 in a natural position consistent with the layout — resting on a shelf, tucked inside an open cabinet, beside stored food containers, or presented flat as a packshot.

"ONE PRESENTATION" means: whatever Image 2 shows is rendered once, as one arrangement. If Image 2 shows a single sachet, render one sachet. If Image 2 shows the blue retail pouch, render that pouch. If Image 2 shows the pouch with a sachet standing beside it, reproduce that exact pairing as the single product presentation — do not multiply it, do not add a third element, and do not scatter extra sachets around the canvas.

FORBIDDEN: adding extra sachets beyond what Image 2 shows, additional product graphics, duplicate copies of the packshot, "decorative" Image 2 elements in corners, or trust-seal badges that weren't in the reference.

Any text printed on competitor packaging in Image 1 is DISCARDED — never transcribed onto the canvas.`);

    rules.push(`${brand.productName.toUpperCase()} VISUAL FIDELITY — STRICT (PIXEL-PERFECT COPY):
The product in your output MUST look identical to Image 2 in EVERY visual aspect:
- Same shape (do NOT render it as a different product, alternative form factor, or generic "rodent repellent" interpretation. If Image 2 is a stand-up foil pouch, the output is that pouch. If Image 2 is a flat non-woven sachet, the output is that sachet. Not "similar" — IDENTICAL.)
- Same color and material finish (same foil sheen or non-woven fabric texture, same blue hex, same white)
- Same proportions and silhouette
- Same logo/branding and label artwork placement on the product face (only ${brand.productName}'s branding from Image 2 — never competitor branding). The Hebrew text printed on the pouch is part of the packaging artwork: reproduce it as it appears in Image 2, and never treat it as ad copy to rewrite or translate.
- Same details: zip seal, seam, rounded corners, printed badges, logo position — all match Image 2

DO NOT redraw, redesign, reimagine, mirror, flip, or "improve" the product. DO NOT use Image 1's product as a template and "rebrand" it — that is forbidden. DO NOT substitute an electronic device for the sachet under any circumstances. The output product is Image 2 placed into the layout, NOT Image 1's product with a different sticker.

If you cannot reproduce Image 2 exactly, leave a clean placeholder space rather than inventing a different-looking product. Across all aspect ratios (1:1 and 9:16), the product appears IDENTICAL — same shape, same color, same orientation, same branding.`);

    rules.push(`NO TEXT ON PRODUCT (BRANDED OR OTHERWISE):
NEVER place ANY marketing text, headline, stat, copy, or promotional text ON TOP of the ${brand.productName} sachet or its box. The ONLY text visible on the product is its built-in "${brand.productName}" branding and label artwork (or whatever branding appears on Image 2). No competitor brand names. No double-branding. No marketing slogans. All marketing copy goes on the background/canvas, never overlapping the product image.`);
  }

  return rules;
}
