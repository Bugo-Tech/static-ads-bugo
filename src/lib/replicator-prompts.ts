import { Language } from "./types";

/**
 * REPLICATOR — dedicated prompts for the Pest Lab → Bugo 1:1 copy workflow.
 *
 * This module is COMPLETELY ISOLATED from src/lib/prompts.ts (the main flow's prompts).
 * Do not import these from the main flow, and do not import the main flow's prompts here.
 */

const languageNames: Record<Language, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
  de: "German",
  ru: "Russian",
  fr: "French",
};

const languageDirections: Record<Language, "RTL" | "LTR"> = {
  he: "RTL",
  en: "LTR",
  ar: "RTL",
  de: "LTR",
  ru: "LTR",
  fr: "LTR",
};

export interface ReplicatorAnalysis {
  productVariant: "indoor" | "outdoor";
  productVariantConfidence: "high" | "medium" | "low";
  productVariantReasoning: string;
  copySections: { id: string; label: string; originalText: string; adaptedText: string }[];
  headlineSection: {
    id: string;
    pestMentioned: string; // English (for default variant suggestions)
    /** EXACT word(s) in the headline (in target language) that name the pest. Used for substring replacement. */
    pestPhraseInTarget: string;
  } | null;
  detectedPestType: string;
  visualLayoutDescription: string;
  aspectRatio: "1:1" | "9:16" | "other";
}

export function getReplicatorAnalysisPrompt(language: Language): string {
  const lang = languageNames[language];
  const dir = languageDirections[language];

  return `You are the **Pest Lab → Bugo Replicator** — a specialized analyst for ONE narrow task: copy competitor (Pest Lab) ads pixel-identically and adapt them to the Bugo brand in ${lang}.

## CRITICAL CONTEXT
- Pest Lab and Bugo make the **SAME PHYSICAL DEVICES** (Indoor: white oval ultrasonic plug-in. Outdoor: solar ground stake for gardens). The ONLY difference between a Pest Lab ad and a Bugo ad is the small brand logo on the device + the brand text in the copy.
- Your job is to extract everything needed to produce a pixel-identical replica with only the brand swapped and the text translated.

## STEP 1 — Detect product variant (Indoor vs Outdoor)

Look at the reference and decide:
- **Indoor** → device is the white oval/egg-shaped plug-in repeller, OR the ad mentions/shows indoor pests (cockroaches, ants, bedbugs, spiders, fleas, indoor mice), OR the setting is a home interior (kitchen, bedroom, living room).
- **Outdoor** → device is the solar ground stake, OR the ad mentions/shows outdoor/underground pests (moles, snakes, garden mice, voles, rabbits, snakes), OR the setting is a yard/garden.

Provide a confidence ("high"|"medium"|"low") and a one-sentence reasoning.

## STEP 2 — Extract ALL text on the canvas

For EVERY visible text element, capture:
- a stable id ("s1", "s2", ...)
- a label (headline, sub-headline, body, cta, badge, testimonial, price, disclaimer, etc.)
- originalText: exact text as shown (verbatim)
- adaptedText: the equivalent in ${lang}, RTL/LTR-aware (${dir})

Match the reference's hierarchy and length closely — don't expand or shrink dramatically.

## STEP 3 — Identify the headline pest

If a headline names a specific pest (e.g., "Bedbugs gone forever", "פשפשי מיטה", "No more roaches"), capture:
- headlineSection.id (matches one of the copySections)
- headlineSection.pestMentioned (in English, lowercase, e.g., "bedbugs", "cockroaches", "moles")
- headlineSection.pestPhraseInTarget — the EXACT word(s) AS THEY APPEAR in the headline's adaptedText (${lang}). Examples: "פשפשי מיטה", "מכרסמים", "ג'וקים", "тараканов", "صراصير". This is the substring that will be replaced when generating headline-swap variants.

If no specific pest is named in the headline, set headlineSection to null.

## STEP 4 — Visual layout description

ONE paragraph (~60 words) describing the visual: composition, colors, where the device sits, where text blocks are positioned. This is reference material for the Nano Banana prompt.

## STEP 5 — Aspect ratio

Best estimate: "1:1" | "9:16" | "other".

## OUTPUT — JSON (no markdown, no code fences)

{
  "productVariant": "indoor" | "outdoor",
  "productVariantConfidence": "high" | "medium" | "low",
  "productVariantReasoning": "one sentence",
  "copySections": [{"id":"s1","label":"headline","originalText":"...","adaptedText":"..."}, ...],
  "headlineSection": {"id":"s1","pestMentioned":"bedbugs","pestPhraseInTarget":"פשפשי מיטה"} | null,
  "detectedPestType": "main pest the ad targets, in English",
  "visualLayoutDescription": "60-word paragraph",
  "aspectRatio": "1:1" | "9:16" | "other"
}

Return ONLY the JSON. No prose before or after.`;
}

export interface ReplicatorGenerationInput {
  language: Language;
  productVariant: "indoor" | "outdoor";
  /** All copy sections (from analysis), already adapted to target language. */
  copySections: { id: string; label: string; adaptedText: string }[];
  /** The id of the section that holds the headline (used when swapping pest). */
  headlineSectionId: string | null;
  /**
   * If provided, REPLACE the pest in the headline (and any pest imagery in the ad) with the new pest.
   * `originalPestPhrase` = the literal word(s) in the headline's text (target language) to find-and-replace.
   * `originalPestEnglish` = English name (used in the prompt to tell Nano Banana what the OLD pest looks like).
   * `newPest` = the user's chosen replacement pest (in target language, e.g., "ג'וקים", "snakes").
   * `newPestEnglish` = same in English (for visual prompt clarity, e.g., "cockroaches", "snakes").
   * If null/undefined, no swap (Variant 1 = faithful).
   */
  headlinePestSwap?: {
    originalPestPhrase: string;
    originalPestEnglish: string;
    newPest: string;
    newPestEnglish: string;
  };
  /** Free-form description of the reference's visual layout (from analysis). */
  visualLayoutDescription: string;
  /** Original aspect ratio of the reference. */
  aspectRatio: "1:1" | "9:16" | "other";
}

/**
 * Build the Nano Banana prompt for ONE replicator variant.
 * The prompt is uncompromising about pixel fidelity — same device, same layout, same everything except brand + language.
 */
export function buildReplicatorGenerationPrompt(input: ReplicatorGenerationInput): string {
  const lang = languageNames[input.language];
  const dir = languageDirections[input.language];

  // Apply headline pest swap if requested — replace literal target-language phrase
  const sections = input.copySections.map((s) => {
    if (
      input.headlinePestSwap &&
      input.headlineSectionId &&
      s.id === input.headlineSectionId
    ) {
      // Escape regex special chars in the phrase so we can do a literal replacement
      const escaped = input.headlinePestSwap.originalPestPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const swapped = s.adaptedText.replace(new RegExp(escaped, "g"), input.headlinePestSwap.newPest);
      return { ...s, adaptedText: swapped };
    }
    return s;
  });

  // Build pest-imagery swap instruction (when applicable) — tells Nano Banana to also change visual pest depictions
  const pestImagerySwapBlock = input.headlinePestSwap
    ? `\n## PEST IMAGERY SWAP (CRITICAL — match copy to visuals)

The original reference depicts **${input.headlinePestSwap.originalPestEnglish}** in its imagery (icons, silhouettes, photos, illustrations, prohibition symbols, or any visual depiction of the pest). The new headline talks about **${input.headlinePestSwap.newPestEnglish}** instead.

You MUST replace EVERY visual depiction of ${input.headlinePestSwap.originalPestEnglish} with a visual depiction of ${input.headlinePestSwap.newPestEnglish}, in the SAME positions, SAME sizes, SAME styles (silhouette → silhouette, photo → photo, icon → icon, in/out of prohibition circles, etc.). The image of the pest in the ad MUST match the pest named in the headline. No mismatch allowed.

If the reference shows ${input.headlinePestSwap.originalPestEnglish} crossed out (no-pests sign), show ${input.headlinePestSwap.newPestEnglish} crossed out in the exact same way.

### PEST VISUAL REFERENCE — DO NOT CONFUSE THESE
${getPestVisualReference(input.headlinePestSwap.newPestEnglish)}

CRITICAL: The pest you depict MUST be ${input.headlinePestSwap.newPestEnglish.toUpperCase()} — NOT a different animal. Common mistakes to AVOID:
- Mice/rats are SMALL rodents with long thin tails and pointed snouts. They are NOT rabbits, NOT spiders, NOT moles.
- Rabbits are MEDIUM-LARGE animals with LONG ears and short fluffy tails. They are NOT mice, NOT cats.
- Snakes are LIMBLESS REPTILES with elongated scaly bodies. They are NOT worms, NOT eels.
- Cockroaches are FLAT BROWN INSECTS with 6 legs and antennae. They are NOT beetles, NOT spiders.
- Spiders are 8-LEGGED ARACHNIDS with a body in two segments. They are NOT insects, NOT crabs.
- Moles are STOUT UNDERGROUND MAMMALS with tiny eyes and large digging claws. They are NOT mice, NOT shrews.

The headline says "${input.headlinePestSwap.newPest}" (${input.headlinePestSwap.newPestEnglish}). Whatever animal/insect appears in the imagery MUST be unmistakably that exact species. If a viewer who knows zero ${lang} can immediately identify the pest in the image as ${input.headlinePestSwap.newPestEnglish}, you succeeded. Otherwise, regenerate that pest depiction.\n`
    : "";

  const copyBlock = sections
    .filter((s) => s.adaptedText && s.adaptedText.trim())
    .map((s) => `[${s.label}] "${s.adaptedText}"`)
    .join("\n");

  const deviceDescription =
    input.productVariant === "indoor"
      ? `the **Bugo Indoor** ultrasonic pest repeller — white oval/egg-shaped plug-in device with a blue LED ring at the top and the lowercase word "bugo" printed on the front face.`
      : `the **Bugo Outdoor** solar pest repeller — a ground stake with a solar panel on top, planted into garden soil, with the lowercase word "bugo" on the body.`;

  return `# REPLICATOR MODE — PIXEL-IDENTICAL COPY OF THE REFERENCE

You are receiving ONE reference image (a Pest Lab ad). Your job:

## ABSOLUTE RULES (violation = failure)

1. **The device in your output MUST be pixel-identical to the device in the reference.** Pest Lab and Bugo make the SAME physical device — same shape, same orientation, same shadow, same lighting, same proportions, same LED ring color, same angle, same position. The ONLY change to the device itself is replacing the small "PestLab" / "Pest Lab" text on the device face with the lowercase word "bugo" in the same exact font/size/position. NOTHING ELSE on the device changes. It is ${deviceDescription}

2. **NO marketing text is allowed ON TOP of the device image.** The only text on the device is its built-in "bugo" logo.

3. **Replicate the ENTIRE layout pixel-identically.** Same background, same gradients, same colors, same composition, same element positions, same fonts, same font weights, same sizes, same colors. The output should look like the reference photographed and copy-pasted, with only the changes below.

4. **DO NOT add any visual element** that isn't in the reference. No new icons, no new badges, no new decorations, no extra shapes. Match the reference 1-to-1.${input.headlinePestSwap ? " EXCEPTION: pest imagery may be swapped per the PEST IMAGERY SWAP section below — same count, same positions, same style, only the species changes." : ""}

5. **DO NOT remove any visual element** that IS in the reference. Same icons in same positions.

## THE ONLY ALLOWED CHANGES

A. **Brand text swap**: Every appearance of "Pest Lab" / "PestLab" / "pestlab" in text on the canvas (including on the device) → replace with "bugo" / "Bugo" matching the original case.

B. **Language swap**: Replace ALL canvas text (headlines, sub-headlines, body, CTA, badges, testimonials, prices, disclaimers) with the ${lang} (${dir}) text provided below. Match each text block's font weight, size, color, and position to the reference. ${dir === "RTL" ? "Mirror text alignment to right-aligned for RTL." : "Keep text alignment as in reference."}

## EXACT ${lang.toUpperCase()} COPY TO USE (use VERBATIM)

${copyBlock}
${pestImagerySwapBlock}
## REFERENCE LAYOUT (for your awareness — replicate exactly)

${input.visualLayoutDescription}

## ASPECT RATIO

${input.aspectRatio === "other" ? "Match the reference exactly — same proportions." : `Output in ${input.aspectRatio} matching the reference.`}

## FINAL CHECKLIST BEFORE GENERATING

- [ ] Device is identical to reference (only "PestLab" → "bugo" on the device)
- [ ] Background, colors, gradients, composition: identical to reference
- [ ] Every text block from the reference is present, in ${lang}, in the same position/weight/color
- [ ] No new visual elements, no removed visual elements
- [ ] No marketing text on top of the device${input.headlinePestSwap ? `\n- [ ] All pest imagery has been swapped from ${input.headlinePestSwap.originalPestEnglish} to ${input.headlinePestSwap.newPestEnglish} — same positions, same count, same style` : ""}

Generate the image now.`;
}

/**
 * The 3 default alternate pests to swap into the headline for variants 2-4.
 * These are sensible Bugo-relevant defaults; the user can override in the UI.
 */
export const DEFAULT_HEADLINE_PEST_VARIANTS: Record<"indoor" | "outdoor", { language: Language; pests: string[] }[]> = {
  indoor: [
    { language: "he", pests: ["ג'וקים", "עכברים", "עקיצות"] },
    { language: "en", pests: ["roaches", "mice", "bites"] },
    { language: "ar", pests: ["صراصير", "فئران", "لدغات"] },
    { language: "de", pests: ["Schaben", "Mäusen", "Stichen"] },
    { language: "ru", pests: ["тараканов", "мышей", "укусов"] },
    { language: "fr", pests: ["cafards", "souris", "piqûres"] },
  ],
  outdoor: [
    { language: "he", pests: ["נחשים", "עכברי שדה", "שפנים"] },
    { language: "en", pests: ["snakes", "field mice", "rabbits"] },
    { language: "ar", pests: ["ثعابين", "فئران الحقل", "أرانب"] },
    { language: "de", pests: ["Schlangen", "Feldmäusen", "Kaninchen"] },
    { language: "ru", pests: ["змей", "полёвок", "кроликов"] },
    { language: "fr", pests: ["serpents", "souris des champs", "lapins"] },
  ],
};

export function getDefaultPestVariants(productVariant: "indoor" | "outdoor", language: Language): string[] {
  const entry = DEFAULT_HEADLINE_PEST_VARIANTS[productVariant].find((e) => e.language === language);
  return entry?.pests || ["", "", ""];
}

/**
 * Returns a precise visual description of the named pest so Nano Banana renders the correct species.
 * Falls back to a generic instruction if the pest isn't in the lookup.
 */
function getPestVisualReference(pestEnglish: string): string {
  const key = pestEnglish.toLowerCase().trim();
  const refs: Record<string, string> = {
    mouse: "Small gray-brown rodent, ~7-10 cm body length, pointed snout, large round ears, long thin pink tail, small black eyes. Looks like a typical house mouse photograph.",
    mice: "Small gray-brown rodents, ~7-10 cm body length, pointed snouts, large round ears, long thin pink tails, small black eyes. Typical house mice.",
    rat: "Larger rodent than a mouse, ~20-25 cm body length, thicker body, gray or brown fur, long scaly tail, blunter snout than a mouse.",
    rats: "Larger rodents than mice, ~20-25 cm body, thick bodies, gray/brown fur, long scaly tails, blunter snouts.",
    "field mice": "Small gray-brown rodents in a field/garden setting, pointed snouts, big ears, long tails. Same as house mice but shown outdoors.",
    voles: "Small stocky rodents with short tails (much shorter than mice), small ears, blunt snouts. Brown fur. Look mole-like but above ground.",
    rabbit: "Medium-large mammal with VERY LONG upright ears (the defining feature), short fluffy round tail, hopping posture, brown/gray/white fur. Easy to recognize by the long ears.",
    rabbits: "Medium-large mammals with VERY LONG upright ears, short fluffy round tails, brown/gray/white fur. The long ears are unmistakable.",
    snake: "Limbless reptile, long elongated scaly body, no legs at all, often coiled or slithering on the ground. Could be brown/green/black.",
    snakes: "Limbless reptiles with long scaly bodies, no legs, often coiled.",
    mole: "Stout underground mammal, ~12-16 cm, dark velvety fur, TINY eyes (almost hidden), large pink shovel-like front claws for digging. Often shown emerging from soil/molehill.",
    moles: "Stout underground mammals, dark velvety fur, tiny eyes, large pink digging claws. Often emerging from soil.",
    cockroach: "Flat brown/dark insect, ~3-5 cm long, oval body, 6 long legs, two long antennae. Looks like a typical kitchen roach.",
    cockroaches: "Flat brown/dark insects, oval bodies, 6 long legs, two long antennae each.",
    roach: "Flat brown/dark insect, oval body, 6 legs, two long antennae.",
    roaches: "Flat brown/dark insects, oval bodies, 6 legs, two long antennae each.",
    ant: "Tiny insect, ~3-5 mm, 6 legs, segmented body (head/thorax/abdomen), small antennae. Black or red. Often shown in a line.",
    ants: "Tiny insects, 6 legs, segmented bodies, small antennae. Black or red. Often in lines or swarms.",
    spider: "8-LEGGED arachnid (NOT 6-legged like insects), body in two main segments, no antennae. Often hairy. Could be in a web.",
    spiders: "8-LEGGED arachnids (not insects), bodies in two segments, no antennae. Often hairy.",
    bedbug: "Tiny flat oval reddish-brown insect, ~5 mm, 6 legs, no wings. Often shown on mattress fabric or bedding.",
    bedbugs: "Tiny flat oval reddish-brown insects, 6 legs, no wings, often on mattress fabric.",
    "bed bug": "Tiny flat oval reddish-brown insect, ~5 mm, 6 legs, no wings, on bedding.",
    "bed bugs": "Tiny flat oval reddish-brown insects, on bedding.",
    mosquito: "Small flying insect with long thin legs, narrow body, transparent wings, long proboscis (mouthpart). Often shown biting skin.",
    mosquitoes: "Small flying insects with long thin legs, narrow bodies, transparent wings, long proboscises.",
    flea: "Tiny brown wingless jumping insect, ~2-3 mm, oval body, often on pet fur.",
    fleas: "Tiny brown wingless jumping insects, often on pet fur.",
    bites: "Show red itchy bite marks on human skin (arms, legs) — small red bumps in clusters or rows. NOT the insect itself; show the BITES on the body.",
    bite: "Red itchy bite marks on human skin — small red bumps.",
  };
  return refs[key] || `Show a clear, anatomically accurate ${pestEnglish}. Make sure a viewer can immediately identify the species.`;
}
