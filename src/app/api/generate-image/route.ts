import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import { readFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, referenceImageUrl, productImageIds, size = "1:1" } = body;

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
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

    const result = await submitGeneration({
      prompt,
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
