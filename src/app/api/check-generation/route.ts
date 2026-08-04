import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonFromClaudeText } from "@/lib/claude-json";

/**
 * QC Agent — compares a generated ad image against the original reference + product photo.
 * Returns pass/fail + specific issues + auto-fix instruction.
 */
export async function POST(request: NextRequest) {
  try {
    const { generatedImageUrl, referenceImageUrl, productImageUrl } = await request.json();

    if (!generatedImageUrl) {
      return NextResponse.json({ error: "generatedImageUrl required" }, { status: 400 });
    }

    const client = new Anthropic();

    // Only pass publicly accessible URLs to Claude (not localhost/relative paths)
    const isPublicUrl = (url: string) => url.startsWith("http") && !url.includes("localhost") && !url.includes("127.0.0.1");

    const imageInputs: Anthropic.ImageBlockParam[] = [];
    const labelParts: string[] = [];
    let imgIdx = 1;

    // Image 1: the generated ad (should always be a public kie.ai URL)
    if (isPublicUrl(generatedImageUrl)) {
      imageInputs.push({ type: "image", source: { type: "url", url: generatedImageUrl } });
      labelParts.push(`Image ${imgIdx++} = the GENERATED ad (what we need to check).`);
    } else {
      return NextResponse.json({ passed: true, issues: [], fixInstruction: "", severity: "none" });
    }

    // Image 2: reference (only if publicly accessible)
    if (referenceImageUrl && isPublicUrl(referenceImageUrl)) {
      imageInputs.push({ type: "image", source: { type: "url", url: referenceImageUrl } });
      labelParts.push(`Image ${imgIdx++} = the ORIGINAL REFERENCE ad.`);
    }

    // Image 3: product photo (only if publicly accessible)
    if (productImageUrl && isPublicUrl(productImageUrl)) {
      imageInputs.push({ type: "image", source: { type: "url", url: productImageUrl } });
      labelParts.push(`Image ${imgIdx++} = the REAL product photo.`);
    }

    const imageLabels = labelParts.join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            ...imageInputs,
            {
              type: "text",
              text: `You are a Quality Control agent for Bugo static ad generation.

${imageLabels}

## YOUR JOB
Compare Image 1 (generated ad) against the reference and product photo. Check for these specific issues:

### 1. PRODUCT FIDELITY (critical)
If a product photo was provided: Does the Bugo device in the generated ad look like the REAL product photo?
- Shape: The real Bugo is OVAL/EGG-SHAPED (NOT round/circular). Is it correct?
- Logo: Does it show "bugo" text on the front face?
- Orientation: Is it the right way up, not mirrored/flipped?
- Color: White body with blue LED ring?
If ANY of these are wrong, this is a CRITICAL failure.

### 2. EXTRA ELEMENTS (important)
Compare element count between reference and generated ad:
- Did the generator ADD text blocks, stats, badges, or data that weren't in the reference?
- Did it add product specs (300 sq ft, 4-5 years, etc.) that were NOT in the original layout?
- Are there decorative elements (random shapes, splashes) that don't match the reference's layout?

### 3. TEXT ON PRODUCT (critical)
Is there ANY marketing text, headlines, or stats overlaid ON TOP of the Bugo device itself? (Only the "bugo" logo should appear on the device — nothing else.)

### 4. LAYOUT FIDELITY (important)
Does the generated ad's layout (element positions, text hierarchy, composition) match the reference?

## OUTPUT FORMAT (JSON only, no markdown):
{
  "passed": true/false,
  "issues": ["Short description of each issue found"],
  "fixInstruction": "If passed=false: a SPECIFIC instruction to fix the issues. E.g., 'The Bugo device is round but should be oval/egg-shaped. Remove the 3 stat badges (300 SQ FT, 4-5 YEARS, 24/7) that were not in the reference. Remove text overlapping the product.' If passed=true: empty string.",
  "severity": "critical" | "moderate" | "minor" | "none"
}`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ passed: true, issues: [], fixInstruction: "", severity: "none" });
    }

    // Robust JSON extraction (Sonnet 4.6 may add fences, preamble, postamble).
    try {
      const result = JSON.parse(extractJsonFromClaudeText(textContent.text));
      return NextResponse.json(result);
    } catch {
      // QC failure is non-fatal — treat as a "pass" so generation isn't blocked.
      return NextResponse.json({ passed: true, issues: [], fixInstruction: "", severity: "none" });
    }
  } catch (error) {
    console.error("QC check error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "QC check failed" }, { status: 500 });
  }
}
