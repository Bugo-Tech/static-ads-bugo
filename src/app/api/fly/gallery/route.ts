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
  mapGalleryRow,
} from "@/lib/supabase-db";
import { downloadAndStore, getSignedUrl, getSignedUrls, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

const PRODUCT_SCOPE = "fly";

export async function GET() {
  try {
    const [images, folders] = await Promise.all([
      getGalleryImages(PRODUCT_SCOPE),
      getGalleryFolders(),
    ]);

    // Generate signed URLs for all images in a single batch call
    let signedUrls = new Map<string, string>();
    try {
      signedUrls = await getSignedUrls(
        "gallery",
        images.map((img) => img.storage_path).filter(Boolean)
      );
    } catch {
      // Fall back to stored URLs below
    }
    const imagesWithUrls = images.map((img) =>
      mapGalleryRow(img, signedUrls.get(img.storage_path))
    );

    return NextResponse.json({ images: imagesWithUrls, folders });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

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
    console.error("Fly gallery error:", message, stack);
    return NextResponse.json(
      { error: message, where: "POST /api/fly/gallery" },
      { status: 500 }
    );
  }
}

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
    console.error("Fly gallery delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
