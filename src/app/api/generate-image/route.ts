import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import { readFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, referenceImageUrl, productImageIds, size = "1:1", copyVariation, enhancedVariationMatching, includeProduct = true, isCrossSize = false, enforceCleanLayout = false } = body;

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    // Build the final prompt: base prompt + specific copy variation text
    // For cross-size: the generated image IS the reference. Skip copy/product injection —
    // text is already baked into the image. Model should ONLY resize.
    let finalPrompt = prompt;
    if (isCrossSize) {
      // Cross-size: prompt already contains resize instruction. Don't append anything else.
    } else if (!enforceCleanLayout && copyVariation?.sections?.length) {
      // === LEGACY PATH — UNCHANGED. Only runs when enforceCleanLayout=false. ===
      // Filter out sections the user deleted (empty adaptedText)
      const nonEmptySections = copyVariation.sections.filter(
        (s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()
      );
      const copyBlock = nonEmptySections
        .map((s: { label: string; adaptedText: string }) => `${s.label}: "${s.adaptedText}"`)
        .join("\n");
      finalPrompt += `\n\nIMPORTANT — USE EXACTLY THIS COPY TEXT (variation: ${copyVariation.angle}):\n${copyBlock}\n\nRender ONLY the copy lines listed above. The user may have removed some lines intentionally — do NOT invent replacements for missing lines. If a section from the reference is not listed above, OMIT it from the image entirely.`;

      if (enhancedVariationMatching) {
        finalPrompt += `\n\nCRITICAL — VISUAL MATCHING: The visual imagery, icons, illustrations, and any depicted pests or subjects in the image MUST match the copy text above. If the copy mentions specific pests, animals, or topics — show THOSE in the image, not others. The variation angle is "${copyVariation.angle}" — ensure all visuals reinforce this specific angle. Do NOT reuse visual elements that contradict the copy text.`;
      }
    }

    // Upload reference image to a public host (kie.ai needs public URLs)
    let publicRefUrl: string | undefined;
    if (referenceImageUrl?.startsWith("/api/upload/file/") || referenceImageUrl?.startsWith("/api/products/file/")) {
      const filename = referenceImageUrl.split("/").pop()!;
      const dir = referenceImageUrl.includes("/products/")
        ? path.join(process.cwd(), "uploads", "products")
        : path.join(process.cwd(), "uploads", "references");
      const filepath = path.join(dir, filename);
      publicRefUrl = await uploadToPublicHost(filepath);
    } else if (referenceImageUrl?.startsWith("http")) {
      publicRefUrl = referenceImageUrl;
    }

    // Upload product image to public host — skip for cross-size (product is already in the image)
    let publicProductUrl: string | undefined;
    if (!isCrossSize && includeProduct && productImageIds && productImageIds.length > 0) {
      try {
        const indexPath = path.join(process.cwd(), "uploads", "products", "index.json");
        const indexData = JSON.parse(await readFile(indexPath, "utf-8"));
        const product = indexData.find((p: { id: string }) => p.id === productImageIds[0]);
        if (product) {
          const filepath = path.join(process.cwd(), "uploads", "products", product.filename);
          publicProductUrl = await uploadToPublicHost(filepath);
        }
      } catch {
        // No product images, continue without
      }
    }

    console.log("=== GENERATE IMAGE DEBUG ===");
    console.log("Prompt:", prompt?.substring(0, 300));
    console.log("Public ref URL:", publicRefUrl);
    console.log("Public product URL:", publicProductUrl);
    console.log("Size:", size);
    console.log("Enforce clean layout:", enforceCleanLayout);
    console.log("=== END DEBUG ===");

    // === LEGACY PATH — UNCHANGED. Only runs when enforceCleanLayout=false. ===
    // If product image is provided (and not cross-size), add explicit instruction
    if (!enforceCleanLayout && publicProductUrl && !isCrossSize) {
      finalPrompt = `HIGHEST PRIORITY — PRODUCT IMAGE FIDELITY:
You are receiving TWO images. Image 1 is the reference ad layout. Image 2 is the EXACT Bugo product photo.
The Bugo device in the final image MUST be a pixel-perfect copy of Image 2.
Do NOT redraw, approximate, or reimagine the device. Copy it EXACTLY — same shape, same proportions, same LED glow color, same angle, same text placement.

DEVICE SHAPE ANCHOR: The Bugo device is OVAL/EGG-SHAPED (NOT round/circular), white, with a blue LED ring at the top, and the word "bugo" printed in lowercase on the front face.
- Do NOT make it round or circular.
- Do NOT remove or change the "bugo" logo.
- Do NOT mirror or flip the device.
- If you cannot reproduce it exactly, leave a blank placeholder space.

ABSOLUTE RULE — NO TEXT ON PRODUCT: NEVER place ANY marketing text, headlines, stats, copy, or promotional text ON TOP of the Bugo device itself. The ONLY text on the device is its built-in "bugo" logo. Marketing text goes on the background/canvas, NEVER overlapping the product image.

---

${finalPrompt}`;
    }

    // === NEW PATH — opt-in via enforceCleanLayout flag (only New Batch sends true). ===
    // Builds an "ABSOLUTE RULES" block at the top, demotes layout to composition guidance.
    if (enforceCleanLayout && !isCrossSize) {
      const rules: string[] = [];

      if (copyVariation?.sections?.length) {
        const nonEmptySections = copyVariation.sections.filter(
          (s: { adaptedText: string }) => s.adaptedText && s.adaptedText.trim()
        );
        const copyBlock = nonEmptySections
          .map((s: { label: string; adaptedText: string }) => `${s.label}: "${s.adaptedText}"`)
          .join("\n");
        rules.push(`CONTENT WHITELIST — ABSOLUTE RULE (variation: ${copyVariation.angle}):
The ONLY copy/text/badges/stats/labels that may appear in the final image are EXACTLY these lines:
${copyBlock}

Anything NOT on this whitelist — even if it appears in the reference OR in the layout description below — MUST be omitted entirely. The user has deliberately curated this list. Items they removed are not "missing" — they are intentional empty space. Do NOT:
- Invent placeholder text, generic stats, or filler copy
- Add decorative badges, certification marks, trust seals, or rating stars not on the list
- Generate sub-headlines, taglines, tabs, or product specs not on the list
- Recreate text that was visible in the reference but not on this list

If the reference layout shows N text blocks but the whitelist has fewer, render only the whitelisted ones in their natural positions and leave the other positions as clean empty space (matching adjacent background).`);
      }

      if (publicProductUrl) {
        rules.push(`PRODUCT REPLACEMENT — ABSOLUTE RULE:
If the reference image (Image 1) contains ANY competitor product — bottle, package, bag, box, sachet, tube, device, sticker, or branded item — that product MUST BE COMPLETELY REMOVED from the final image. Do NOT preserve, redraw, recolor, or relabel it.

In its exact position, size, and angle, place the Bugo device (Image 2) — pixel-perfect copy.

ANY text, branding, ingredient list, nutritional info, weight, barcode, certification, or marketing copy printed on the original product packaging is DISCARDED. Do not transcribe it, do not adapt it, do not move it elsewhere on the canvas. It disappears with the product.

This rule is HIGHER PRIORITY than visual continuity with the reference.`);

        rules.push(`BUGO PRODUCT FIDELITY:
The Bugo device in the final image MUST be a pixel-perfect copy of Image 2.
Shape: OVAL/EGG-SHAPED (NOT round/circular), white body, blue LED ring at the top, "bugo" text printed in lowercase on the front face.
Do NOT redraw, approximate, mirror, flip, or reimagine the device. Do NOT modify the "bugo" logo.`);

        rules.push(`NO TEXT ON PRODUCT:
NEVER place ANY marketing text, headlines, stats, copy, or promotional text ON TOP of the Bugo device itself. The ONLY text on the device is its built-in "bugo" logo. Marketing text goes on the background/canvas, NEVER overlapping the product image.`);
      }

      if (copyVariation?.sections?.length && enhancedVariationMatching) {
        rules.push(`VISUAL MATCHING:
The visual imagery, icons, illustrations, and any depicted pests or subjects in the image MUST match the copy text in the whitelist above. If the copy mentions specific pests, animals, or topics — show THOSE in the image, not others. The variation angle is "${copyVariation.angle}" — ensure all visuals reinforce this specific angle.`);
      }

      const rulesBlock = rules.length
        ? `ABSOLUTE RULES — VIOLATING ANY = TASK FAILURE:\n\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n\n")}\n\n---\n\n`
        : "";

      finalPrompt = `${rulesBlock}LAYOUT REFERENCE (composition guidance only — actual rendered content is governed by the rules above):\n\n${prompt}`;
    }

    const result = await submitGeneration({
      prompt: finalPrompt,
      referenceImageUrl: publicRefUrl,
      productImageUrl: publicProductUrl,
      size,
    });

    return NextResponse.json({ jobId: result.jobId });
  } catch (error) {
    console.error("Generate image error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
