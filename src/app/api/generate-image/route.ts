import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import { readFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, referenceImageUrl, productImageIds, size = "1:1", copyVariation } = body;

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    // Build the final prompt: base prompt + specific copy variation text
    let finalPrompt = prompt;
    if (copyVariation?.sections?.length) {
      // Replace copy text in the prompt with this variation's specific text
      const copyBlock = copyVariation.sections
        .map((s: { label: string; adaptedText: string }) => `${s.label}: "${s.adaptedText}"`)
        .join("\n");
      finalPrompt += `\n\nIMPORTANT — USE EXACTLY THIS COPY TEXT (variation: ${copyVariation.angle}):\n${copyBlock}\n\nRender the above text EXACTLY as written — do not use text from any other variation.`;
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

    // Upload product image to public host if any
    let publicProductUrl: string | undefined;
    if (productImageIds && productImageIds.length > 0) {
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
    console.log("=== END DEBUG ===");

    // If product image is provided, add instruction to replace original product
    if (publicProductUrl) {
      finalPrompt += `\n\nPRODUCT IMAGE REPLACEMENT: The second reference image is the Bugo product photo. Replace ALL product/package images in the ad with this exact Bugo device. Do NOT keep the original product packaging or bottles — replace them entirely with the Bugo device shown in the second image. The Bugo device is a white oval/egg-shaped ultrasonic pest repeller with a blue LED glow.`;
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
