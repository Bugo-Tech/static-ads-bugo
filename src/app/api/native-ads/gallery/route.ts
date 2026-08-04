import { NextRequest, NextResponse } from "next/server";
import {
  getNativeAdsGallery,
  addNativeAdsImage,
  deleteNativeAdsImage,
} from "@/lib/supabase-db";
import { downloadAndStore, getSignedUrl, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function GET() {
  try {
    const images = await getNativeAdsGallery();

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

    return NextResponse.json({ images: imagesWithUrls });
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
      const filename = `native-${id}.png`;
      const storagePath = `native/${filename}`;

      await downloadAndStore(body.sourceUrl, "gallery", storagePath);
      const signedUrl = await getSignedUrl("gallery", storagePath);

      const image = await addNativeAdsImage({
        filename,
        storage_path: storagePath,
        url: signedUrl,
        size: body.size || "1:1",
        prompt: body.prompt,
        metadata: {
          description: body.description,
          pestId: body.pestId,
          vibe: body.vibe,
          batchId: body.batchId,
        },
        created_by: user?.id,
      });

      return NextResponse.json({ image });
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
    if (!imageId) {
      return NextResponse.json({ error: "Missing imageId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: image } = await supabase
      .from("native_ads_gallery")
      .select("storage_path")
      .eq("id", imageId)
      .single();

    if (image?.storage_path) {
      try {
        await deleteFile("gallery", image.storage_path);
      } catch {
        // Continue with DB cleanup
      }
    }

    await deleteNativeAdsImage(imageId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
