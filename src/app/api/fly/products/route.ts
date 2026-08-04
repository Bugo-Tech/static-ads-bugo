import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import type { FlyProductImage } from "@/lib/fly-defaults";
import {
  addProduct,
  deleteProduct,
  ensureUploadsDir,
  productUrl,
  readProductIndex,
  uploadsDir,
} from "@/lib/productImages";

const SCOPE = "fly" as const;

// GET — list Fly product images (committed seed + local uploads)
export async function GET() {
  await ensureUploadsDir(SCOPE);
  const products = await readProductIndex<FlyProductImage>(SCOPE);
  return NextResponse.json({ products });
}

// POST — upload a new Fly product image
export async function POST(request: NextRequest) {
  try {
    await ensureUploadsDir(SCOPE);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const labelOverride = (formData.get("label") as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name) || ".png";
    const id = `fly-prod-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const filename = `${id}${ext}`;

    await writeFile(path.join(uploadsDir(SCOPE), filename), buffer);

    const product: FlyProductImage = {
      id,
      filename,
      url: productUrl(SCOPE, filename),
      label: labelOverride || file.name.replace(/\.[^.]+$/, ""),
      uploadedAt: new Date().toISOString(),
    };

    await addProduct(SCOPE, product);

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Fly product upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// DELETE — remove a Fly product image
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "No id provided" }, { status: 400 });
    }

    await deleteProduct(SCOPE, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fly product delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
