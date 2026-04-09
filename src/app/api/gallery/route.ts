import { NextRequest, NextResponse } from "next/server";
import {
  getGallery,
  addImageToGallery,
  deleteGalleryImage,
  moveImageToFolder,
  createFolder,
  deleteFolder,
  renameFolder,
} from "@/lib/gallery";

// GET — list all gallery images and folders
export async function GET() {
  const gallery = await getGallery();
  return NextResponse.json(gallery);
}

// POST — add image to gallery OR create folder OR move image
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add-image") {
      const image = await addImageToGallery({
        sourceUrl: body.sourceUrl,
        prompt: body.prompt || "",
        size: body.size || "",
        angle: body.angle || "",
        referencePreview: body.referencePreview,
        folderId: body.folderId || "root",
      });
      return NextResponse.json({ image });
    }

    if (body.action === "create-folder") {
      const folder = await createFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (body.action === "move-image") {
      await moveImageToFolder(body.imageId, body.folderId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "rename-folder") {
      await renameFolder(body.folderId, body.name);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Gallery error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

// DELETE — delete image or folder
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");
    const folderId = searchParams.get("folderId");

    if (imageId) {
      await deleteGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deleteFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  } catch (error) {
    console.error("Gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
