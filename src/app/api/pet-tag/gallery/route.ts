import { NextRequest, NextResponse } from "next/server";
import {
  getGalleryImages,
  addGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  getGalleryFolders,
  createGalleryFolder,
  renameGalleryFolder,
  deleteGalleryFolder,
} from "@/lib/supabase-db";
import { downloadAndStore, getSignedUrl, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

const PRODUCT_SCOPE = "pet-tag";

// GET — list all pet-tag gallery images and folders
export async function GET() {
  try {
    const [images, folders] = await Promise.all([
      getGalleryImages(PRODUCT_SCOPE),
      getGalleryFolders(),
    ]);

    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        try {
          const signedUrl = await getSignedUrl("gallery", img.storage_path);
          return { ...img, url: signedUrl };
        } catch {
          return img;
        }
      })
    );

    return NextResponse.json({ images: imagesWithUrls, folders });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST — add image to pet-tag gallery OR create/move/rename folder
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { action } = body;

    if (action === "add-image") {
      const id = crypto.randomUUID();
      const ext = "png";
      const filename = `${id}.${ext}`;
      const storagePath = filename;

      await downloadAndStore(body.sourceUrl, "gallery", storagePath);
      const signedUrl = await getSignedUrl("gallery", storagePath);

      const image = await addGalleryImage({
        filename,
        storage_path: storagePath,
        url: signedUrl,
        size: body.size || "1:1",
        angle: body.angle,
        prompt: body.prompt,
        reference_url: body.referencePreview,
        product_scope: PRODUCT_SCOPE,
        folder: body.folderId || "root",
        source_image_id: body.sourceImageId,
        history_id: body.historyId,
        metadata: {
          originalPrompt: body.originalPrompt,
          referenceImageUrl: body.referenceImageUrl,
          productImageIds: body.productImageIds,
          copyVariation: body.copyVariation,
          isQcFix: body.isQcFix,
          productImageId: body.productImageId,
          productImageLabel: body.productImageLabel,
        },
        created_by: user?.id,
      });

      return NextResponse.json({ image });
    }

    if (action === "create-folder") {
      const folder = await createGalleryFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (action === "move-image") {
      await updateGalleryImage(body.imageId, { folder: body.folderId });
      return NextResponse.json({ success: true });
    }

    if (action === "rename-folder") {
      await renameGalleryFolder(body.folderId, body.name);
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
    const imageId = request.nextUrl.searchParams.get("imageId");
    const folderId = request.nextUrl.searchParams.get("folderId");

    if (imageId) {
      const supabase = await createClient();
      const { data: image } = await supabase
        .from("gallery_images")
        .select("storage_path")
        .eq("id", imageId)
        .single();

      if (image?.storage_path) {
        try {
          await deleteFile("gallery", image.storage_path);
        } catch {
          // File may already be deleted — continue with DB cleanup
        }
      }

      await deleteGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deleteGalleryFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  } catch (error) {
    console.error("Pet Tag gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
