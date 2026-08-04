import { NextRequest, NextResponse } from "next/server";
import {
  getPetTagGallery,
  addImageToPetTagGallery,
  deletePetTagGalleryImage,
  moveImageToPetTagFolder,
  createPetTagFolder,
  deletePetTagFolder,
  renamePetTagFolder,
} from "@/lib/pet-tag-gallery";

// GET — list all pet-tag gallery images and folders
export async function GET() {
  const gallery = await getPetTagGallery();
  return NextResponse.json(gallery);
}

// POST — add image to pet-tag gallery OR create/move/rename folder
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add-image") {
      const image = await addImageToPetTagGallery({
        sourceUrl: body.sourceUrl,
        prompt: body.prompt || "",
        size: body.size || "",
        angle: body.angle || "",
        referencePreview: body.referencePreview,
        folderId: body.folderId || "root",
        originalPrompt: body.originalPrompt,
        referenceImageUrl: body.referenceImageUrl,
        copyVariation: body.copyVariation,
        sourceImageId: body.sourceImageId,
        isQcFix: body.isQcFix,
        productImageId: body.productImageId,
        productImageLabel: body.productImageLabel,
        productImageIds: body.productImageIds,
      });
      return NextResponse.json({ image });
    }

    if (body.action === "create-folder") {
      const folder = await createPetTagFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (body.action === "move-image") {
      await moveImageToPetTagFolder(body.imageId, body.folderId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "rename-folder") {
      await renamePetTagFolder(body.folderId, body.name);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Pet Tag gallery error:", message, stack);
    return NextResponse.json(
      { error: message, where: "POST /api/pet-tag/gallery" },
      { status: 500 }
    );
  }
}

// DELETE — delete image or folder
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");
    const folderId = searchParams.get("folderId");

    if (imageId) {
      await deletePetTagGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deletePetTagFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  } catch (error) {
    console.error("Pet Tag gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
