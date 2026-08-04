/**
 * Bugo Ants prompts — focused on passive gel bait ant traps for Israeli homes.
 * Tight, focused instructions; runtime rules in
 * src/app/api/ants/generate-image/route.ts handle language consistency
 * and product-fidelity enforcement.
 */

import type { Language } from "./types";
import type { AntsBrandConfig } from "./ants-defaults";

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

export function getAntsAnalysisPrompt(brand: AntsBrandConfig, language: Language): string {
  const lang = languageNames[language];
  const dir = languageDirections[language];

  const isUSMarket = language === "en" || language === "de" || language === "fr";
  const brandBookText = isUSMarket
    ? (brand.brandBookContentUS || brand.brandBookContent)
    : brand.brandBookContent;
  const pricingBlock = isUSMarket
    ? `${brand.pricingUS.single || "—"} | ${brand.pricingUS.bundle || "—"}`
    : `${brand.pricing.single || "—"} | ${brand.pricing.bundle || "—"}`;

  return `You are a Visual Template Replicator and Ad Adaptation Expert for "${brand.productName}" — a passive gel bait ant trap that eliminates the entire ant colony including the queen. The product is a small sealed plastic bait station (not an electronic device), placed on the floor or under a counter, containing an amber gel with a boric acid + sugar formula.

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

### Scenario A: Same Niche (gel ant bait, ant killer, ant spray, ant powder, passive ant trap, DIY ant remedies, roach/ant hybrid products)
The output must be visually IDENTICAL to the reference image.
- Replace brand name with "${brand.productName}" — same position, same font style, same size, same color
- Translate/adapt all copy to ${lang}
- Keep every visual element identical
- Replace the original product image with the user-uploaded ${brand.productName} product photo (Image 2)

### Scenario B: Different Niche (any other product category)
If the reference is NOT an ant-control product, replicate the LAYOUT, COMPOSITION, TYPOGRAPHY STYLE, COLORS — but REPLACE niche-specific visuals with ant-invasion / kitchen-hygiene equivalents. ZERO traces of the original niche.

**ELEMENT COUNT RULE**: Count the reference's elements (text blocks, images, icons, badges, CTAs). Your output MUST have the SAME count. Do NOT ADD any new elements — only REPLACE.

**WHAT TO REPLACE**:
- Brand name/logo → "${brand.productName}" in clean text only (no graphic elements from original)
- Product images → the ${brand.productName} bait station (user-uploaded photo, Image 2). Any text printed on the original product packaging is DISCARDED.
- Niche-specific background imagery → ant-invasion / clean-kitchen equivalents (a trail of real ants marching on a kitchen counter, ants swarming spilled sugar, ants coming out of a crack in tile, an open cereal box with ants inside, a mother sighing at ants on the sink, the clean AFTER state — pristine counter with a mug of coffee)
- Niche-specific icons → relevant icons (ant silhouette, sugar cube, cereal box, kitchen counter, tile crack, shield, "no" symbol over an ant, checkmark)
- Before/after concepts → "before = ants on counter / ants in food / sugar trail → after = clean counter, no ants, mom relaxed"
- Testimonials → Israeli-mom / kitchen-owner / family testimonials about ants disappearing, safe home, kids on floor

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
    "niche": "ants" or "other",
    "nicheMapping": "If 'other', explain how the concept maps to ${brand.productName}",
    "referenceHasProduct": true/false,
    "suggestedPrompt": "The complete Nano Banana prompt (see format below)"
  },
  "copyVariations": [
    {
      "id": "var-1",
      "angle": "e.g., colony eliminated including queen",
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
VARIATIONS 2-4: Different marketing angles (colony destruction / natural boric acid safety / passive set-and-forget simplicity / Israeli-kitchen relatability).

## NANO BANANA PROMPT FORMAT
The "suggestedPrompt" must be 600-1500 words. Include:

1. **Opening**:
   - Same niche: "REPLICATE THE REFERENCE EXACTLY. Only changes: (1) replace brand with '${brand.productName}', (2) all visible text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
   - Different niche: "REPLICATE layout / composition / typography / colors. ADAPT visuals to ant-invasion + gel bait trap. Brand: '${brand.productName}'. Text in ${lang}, ${dir === "RTL (right-to-left)" ? "right-aligned (RTL)" : "left-aligned (LTR)"}."
2. **BACKGROUND**: exact gradient / colors with hex codes / direction
3. **EVERY TEXT ELEMENT** described separately top-to-bottom — exact ${lang} text in quotes, font, color hex, position. If reference has a 12-month calendar ring, list all 12 ${language === "he" ? `Hebrew months in order: ${HEBREW_MONTHS}` : `${lang} months in order"`}.
4. **PRODUCT**:
   - ${brand.productName} is a small, sealed plastic gel bait station (disc- or box-shaped, palm-sized). It contains a visible amber gel inside. It is NOT an electronic device — no LEDs, no speakers, no buttons, no cables.
   - If a product photo is provided as a second reference image (Image 2), use that exact image — pixel-perfect copy.
   - NEVER overlay marketing text on top of the device.
5. **ANT VISUALS** — be specific:
   - Real black or brown Israeli house ants (not fire ants, not carpenter ants — small sugar ants)
   - Trailing single-file on a kitchen counter, tile floor, or sink edge
   - Realistic scale — ants are small; multiple ants in a line, not one giant one
   - Kitchen context — white tile backsplash, laminate counter, standard Israeli apartment kitchen
   - BEFORE state: ants trailing to spilled sugar or open food container, mom sighing, general kitchen mess
   - AFTER state: clean counter, no ants visible, Bugo bait station tucked in a corner
6. **ICONS / CTAs**: in ${lang}, in same positions as reference
7. **ASPECT RATIO**: 1:1 or 9:16 (will be set by API; mention briefly)
8. **CLOSING**: "Render ONLY the text described above; nothing else. Every word in ${lang}."

## COPY QUALITY
- Use ONLY verified brand facts from the brand knowledge above
- Never invent claims (never say "instant kill" — Bugo Ants takes 24-48h; never say "kills spiders" — only ants)
- Match original text hierarchy
- Natural, grammatical ${lang} — no random word strings
- Variation 1 = faithful adaptation; Variations 2-4 = creative angle exploration`;
}

/**
 * Per-image runtime product rules.
 */
export function getAntsProductRules(brand: AntsBrandConfig, hasProductImage: boolean): string[] {
  const rules: string[] = [];

  if (hasProductImage) {
    rules.push(`CRITICAL — ${brand.productName.toUpperCase()} IS A DEDICATED PRODUCT:
The brand name "${brand.productName}" contains the word "Bugo" — this is intentional and shares branding with other Bugo product lines. However, ${brand.productName} is a SPECIFIC PRODUCT model for ant control (gel bait station). Your ONLY visual source for what ${brand.productName} looks like is Image 2.

Do not rely on prior knowledge of "Bugo" from training data. Do not render anything else from prior knowledge about "Bugo". Whatever Image 2 shows is the entirety of what ${brand.productName} looks like — use that exact appearance.

CRITICAL: ${brand.productName} is a PASSIVE PLASTIC BAIT STATION — a small sealed disc or box containing visible amber gel. It is NOT an electronic device. Do NOT render any LEDs, speakers, buttons, cables, solar panels, or ultrasonic emitters. If Image 2 shows a passive plastic disc, the output shows a passive plastic disc.`);

    rules.push(`COMPLETE COMPETITOR ERASURE — NO RESIDUAL BRANDING:
The reference image (Image 1) likely contains a competitor product such as "Terro", "Combat", "Raid Ant Bait", "Home Defense", "Bayer Advanced", "Amdro", or another branded ant killer or trap. Wherever that competitor product appears in Image 1:

1. The PHYSICAL DEVICE (shape, color, material, form factor) is REPLACED entirely by Image 2's bait station. Do NOT keep the original device's shape — Image 2 has its own shape and that is what appears in the output.
2. The BRAND TEXT on the device ("Terro", "TERRO", "Combat", "Raid", or any other competitor brand name printed on the product face) is COMPLETELY ERASED — it does not appear anywhere in your output. The only branding on the product face is Image 2's own built-in branding.
3. Any DEVICE-SPECIFIC visual features (nozzle shape, spray can silhouette, powder-bottle profile, sticky-pad backing) come from IMAGE 2, not Image 1. Do not preserve features from Image 1's device.

ABSOLUTELY FORBIDDEN — these are CRITICAL FAILURES:
- Rendering the competitor's device shape/silhouette with Image 2's branding swapped in
- Rendering Image 2's shape but keeping the competitor's brand text ("Terro" alongside "${brand.productName}")
- A HYBRID device that combines the competitor's body with Image 2's coloring or vice versa
- Two brand names on one product (e.g., "Terro ${brand.productName}" or "COMBAT" stacked with "${brand.productName}")
- ANY occurrence of the words "Terro", "Combat", "Raid", "Home Defense", "Bayer", or any competitor brand name anywhere in the output (on the product, in the background, or in text blocks)

The output's product is 100% Image 2, 0% Image 1's product. The competitor brand is fully gone — its name, its silhouette, its color scheme, its features — all replaced by Image 2's appearance.`);

    rules.push(`PRODUCT — IMAGE 2 IS THE EXACT PRODUCT (ONE INSTANCE ONLY):
You receive TWO images. Image 1 = the reference ad layout. Image 2 = the EXACT ${brand.productName} product the user chose for this generation.

Placement rule — the product appears EXACTLY ONCE in your output:
- If Image 1 (the reference) contains a competitor ant product (spray can, powder shaker, sticky pad, foam nozzle, plug-in, another bait station), REMOVE the competitor entirely (device + brand text + all its visual features per the COMPETITOR ERASURE rule above) and place Image 2 in that single position.
- If Image 1 has no visible product, render Image 2 in a natural position consistent with the layout (on the floor by a skirting board, in a kitchen corner, tucked under a sink, next to a cabinet leg). Still just ONE instance.

FORBIDDEN: adding extra bait stations, additional product graphics, duplicate copies of the product, "decorative" Image 2 elements in corners, or trust-seal badges that weren't in the reference. The image contains the product ONCE — wherever the reference naturally places it.

Any text printed on competitor packaging in Image 1 is DISCARDED — never transcribed onto the canvas.`);

    rules.push(`${brand.productName.toUpperCase()} VISUAL FIDELITY — STRICT (PIXEL-PERFECT COPY):
The product in your output MUST look identical to Image 2 in EVERY visual aspect:
- Same shape (do NOT render it as a spray can, a plug-in device, a powder shaker, or a "generic ant killer" interpretation. If Image 2 is a small round disc, the output is a small round disc. If Image 2 is a rectangular box with amber gel visible through a window, the output is exactly that — not "similar", IDENTICAL.)
- Same color and material finish (same plastic finish, same color hex)
- Same proportions and silhouette
- Same logo/branding placement on the product face (only ${brand.productName}'s branding from Image 2 — never competitor branding)
- Same details: gel visibility, opening tab shape, base/foot design, printed markings — all match Image 2

DO NOT redraw, redesign, reimagine, mirror, flip, or "improve" the product. DO NOT use Image 1's device as a template and "rebrand" it — that is forbidden. The output product is Image 2 placed into the layout, NOT Image 1's device with a different sticker.

If you cannot reproduce Image 2 exactly, leave a clean placeholder space rather than inventing a different-looking product. Across all aspect ratios (1:1 and 9:16), the product appears IDENTICAL — same shape, same color, same orientation, same branding.`);

    rules.push(`NO TEXT ON PRODUCT (BRANDED OR OTHERWISE):
NEVER place ANY marketing text, headline, stat, copy, or promotional text ON TOP of the ${brand.productName} bait station itself. The ONLY text visible on the device is its built-in "${brand.productName}" branding (or whatever branding appears on Image 2). No competitor brand names. No double-branding. No marketing slogans. All marketing copy goes on the background/canvas, never overlapping the product image.`);
  }

  return rules;
}
