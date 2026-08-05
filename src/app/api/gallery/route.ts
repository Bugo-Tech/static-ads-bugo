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
import { downloadAndStore, getSignedUrl, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function GET() {
  try {
    const [images, folders] = await Promise.all([
      getGalleryImages(),
      getGalleryFolders(),
    ]);

    // Generate signed URLs for each image
    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        try {
          const signedUrl = await getSignedUrl("gallery", img.storage_path);
          return mapGalleryRow(img, signedUrl);
        } catch {
          return mapGalleryRow(img);
        }
      })
    );

    return NextResponse.json({ images: imagesWithUrls, folders });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json();
    const { action } = body;

    if (action === "add-image") {
      const id = crypto.randomUUID();
      const ext = "png";
      const filename = `${id}.${ext}`;
      const storagePath = filename;

      // Download from Nano Banana and upload to Supabase Storage
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
        product_scope: body.productScope,
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
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const imageId = req.nextUrl.searchParams.get("imageId");
    const folderId = req.nextUrl.searchParams.get("folderId");

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

    return NextResponse.json({ error: "Missing imageId or folderId" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
