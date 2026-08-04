import { NextRequest, NextResponse } from "next/server";
import {
  getFlyGallery,
  addImageToFlyGallery,
  deleteFlyGalleryImage,
  moveImageToFlyFolder,
  createFlyFolder,
  deleteFlyFolder,
  renameFlyFolder,
} from "@/lib/fly-gallery";

export async function GET() {
  const gallery = await getFlyGallery();
  return NextResponse.json(gallery);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add-image") {
      const image = await addImageToFlyGallery({
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
      const folder = await createFlyFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (body.action === "move-image") {
      await moveImageToFlyFolder(body.imageId, body.folderId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "rename-folder") {
      await renameFlyFolder(body.folderId, body.name);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Fly gallery error:", message, stack);
    return NextResponse.json(
      { error: message, where: "POST /api/fly/gallery" },
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
      await deleteFlyGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deleteFlyFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  } catch (error) {
    console.error("Fly gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
