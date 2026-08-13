import { NextRequest, NextResponse } from "next/server";
import { getProductImages, addProductImage, deleteProductImage } from "@/lib/supabase-db";
import { uploadFile, deleteFile, getSignedUrl, getSignedUrls } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import { readProductIndex, type ProductScope } from "@/lib/productImages";
import crypto from "crypto";

const SCOPE: ProductScope = "birds";

export async function GET() {
  try {
    const [seedProducts, dbProducts] = await Promise.all([
      readProductIndex(SCOPE),
      getProductImages(SCOPE),
    ]);

    // DB products with signed URLs (one batch call)
    const nonSeed = dbProducts.filter((p) => !p.is_seed);
    let signedUrls = new Map<string, string>();
    try {
      signedUrls = await getSignedUrls(
        "products",
        nonSeed.map((p) => p.storage_path).filter(Boolean)
      );
    } catch {
      // Fall back to stored URLs
    }
    const dbWithUrls = nonSeed.map((p) =>
      p.storage_path && signedUrls.has(p.storage_path)
        ? { ...p, url: signedUrls.get(p.storage_path) }
        : p
    );

    const allProducts = [...seedProducts, ...dbWithUrls];
    return NextResponse.json({ products: allProducts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "png";
    const filename = `${id}.${ext}`;
    const storagePath = `${SCOPE}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadFile("products", storagePath, buffer, file.type);
    const signedUrl = await getSignedUrl("products", storagePath);

    const product = await addProductImage({
      filename,
      storage_path: storagePath,
      url: signedUrl,
      label: file.name.replace(/\.[^/.]+$/, ""),
      scope: SCOPE,
      is_seed: false,
      created_by: user?.id,
    });

    return NextResponse.json({ product });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: product } = await supabase
      .from("product_images")
      .select("storage_path, is_seed")
      .eq("id", id)
      .single();

    if (product?.storage_path && !product.is_seed) {
      try { await deleteFile("products", product.storage_path); } catch {}
    }

    await deleteProductImage(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
