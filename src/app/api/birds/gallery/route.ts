import { NextRequest, NextResponse } from "next/server";
import {
  getBirdsGallery,
  addImageToBirdsGallery,
  deleteBirdsGalleryImage,
  moveImageToBirdsFolder,
  createBirdsFolder,
  deleteBirdsFolder,
  renameBirdsFolder,
} from "@/lib/birds-gallery";

export async function GET() {
  const gallery = await getBirdsGallery();
  return NextResponse.json(gallery);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add-image") {
      const image = await addImageToBirdsGallery({
        sourceUrl: body.sourceUrl,
        prompt: body.prompt || "",
        size: body.size || "",
        angle: body.angle || "",
        referencePreview: body.referencePreview,
        folderId: body.folderId || "root",
        originalPrompt: body.originalPrompt,
        referenceImageUrl: body.referenceImageUrl,
        productImageIds: body.productImageIds,
        copyVariation: body.copyVariation,
        sourceImageId: body.sourceImageId,
        isQcFix: body.isQcFix,
      });
      return NextResponse.json({ image });
    }

    if (body.action === "create-folder") {
      const folder = await createBirdsFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (body.action === "move-image") {
      await moveImageToBirdsFolder(body.imageId, body.folderId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "rename-folder") {
      await renameBirdsFolder(body.folderId, body.name);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Birds gallery error:", message, stack);
    return NextResponse.json(
      { error: message, where: "POST /api/birds/gallery" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");
    const folderId = searchParams.get("folderId");

    if (imageId) {
      await deleteBirdsGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deleteBirdsFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  } catch (error) {
    console.error("Birds gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
