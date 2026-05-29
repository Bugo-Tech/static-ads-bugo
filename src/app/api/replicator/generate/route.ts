import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { uploadToPublicHost } from "@/lib/imageHost";
import path from "path";
import { Language } from "@/lib/types";
import { buildReplicatorGenerationPrompt } from "@/lib/replicator-prompts";

/**
 * Replicator generate endpoint — DOES NOT touch /api/generate-image.
 * Builds the pixel-identical replication prompt and submits to Nano Banana.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      referenceImageUrl,
      language,
      productVariant,
      copySections,
      headlineSectionId,
      headlinePestSwap,
      visualLayoutDescription,
      aspectRatio,
      size,
    } = body as {
      referenceImageUrl: string;
      language: Language;
      productVariant: "indoor" | "outdoor";
      copySections: { id: string; label: string; adaptedText: string }[];
      headlineSectionId: string | null;
      headlinePestSwap?: {
        originalPestPhrase: string;
        originalPestEnglish: string;
        newPest: string;
        newPestEnglish: string;
      };
      visualLayoutDescription: string;
      aspectRatio: "1:1" | "9:16" | "other";
      size: "1:1" | "9:16";
    };

    if (!referenceImageUrl || !copySections || !language) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Convert local reference URL to a public URL (kie.ai needs public URLs)
    let publicRefUrl: string | undefined;
    if (referenceImageUrl.startsWith("/api/upload/file/")) {
      const filename = referenceImageUrl.split("/").pop()!;
      const filepath = path.join(process.cwd(), "uploads", "references", filename);
      publicRefUrl = await uploadToPublicHost(filepath);
    } else if (referenceImageUrl.startsWith("http")) {
      publicRefUrl = referenceImageUrl;
    } else {
      return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
    }

    const prompt = buildReplicatorGenerationPrompt({
      language,
      productVariant,
      copySections,
      headlineSectionId,
      headlinePestSwap,
      visualLayoutDescription,
      aspectRatio,
    });

    const result = await submitGeneration({
      prompt,
      referenceImageUrl: publicRefUrl,
      productImageUrl: undefined, // Replicator does NOT inject product photo — the reference IS the product
      size,
    });

    return NextResponse.json({ jobId: result.jobId });
  } catch (error) {
    console.error("Replicator generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
