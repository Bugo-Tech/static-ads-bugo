/**
 * Native Ads gallery API.
 *
 * GET    /api/native-ads/gallery        → { images: NativeAdsGalleryImage[] }
 * POST   /api/native-ads/gallery        → action-based:
 *           { action: "add-image", sourceUrl, prompt, size, description?, pestId?, vibe?, batchId? }
 * DELETE /api/native-ads/gallery?imageId=X
 */

import { NextRequest, NextResponse } from "next/server";
import {
  addImageToNativeAdsGallery,
  deleteNativeAdsGalleryImage,
  getNativeAdsGallery,
} from "@/lib/native-ads-gallery";

export async function GET() {
  const gallery = await getNativeAdsGallery();
  return NextResponse.json(gallery);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add-image") {
      if (!body.sourceUrl || typeof body.sourceUrl !== "string") {
        return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
      }
      const image = await addImageToNativeAdsGallery({
        sourceUrl: body.sourceUrl,
        prompt: body.prompt || "",
        size: body.size || "",
        description: body.description,
        pestId: body.pestId,
        vibe: body.vibe,
        batchId: body.batchId,
      });
      return NextResponse.json({ image });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Native ads gallery POST error:", message);
    return NextResponse.json(
      { error: message, where: "POST /api/native-ads/gallery" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "imageId query param required" }, { status: 400 });
    }
    await deleteNativeAdsGalleryImage(imageId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Native ads gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
