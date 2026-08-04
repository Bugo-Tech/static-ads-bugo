import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import path from "path";
import type { FlyProductImage } from "@/lib/fly-defaults";

const PRODUCTS_DIR = path.join(process.cwd(), "uploads", "fly-products");
const INDEX_FILE = path.join(PRODUCTS_DIR, "index.json");

async function ensureDir() {
  await mkdir(PRODUCTS_DIR, { recursive: true });
}

async function readIndex(): Promise<FlyProductImage[]> {
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(products: FlyProductImage[]) {
  await writeFile(INDEX_FILE, JSON.stringify(products, null, 2));
}

export async function GET() {
  await ensureDir();
  const products = await readIndex();
  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  try {
    await ensureDir();

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
    const filepath = path.join(PRODUCTS_DIR, filename);

    await writeFile(filepath, buffer);

    const product: FlyProductImage = {
      id,
      filename,
      url: `/api/fly/products/file/${filename}`,
      label: labelOverride || file.name.replace(/\.[^.]+$/, ""),
      uploadedAt: new Date().toISOString(),
    };

    const products = await readIndex();
    products.push(product);
    await writeIndex(products);

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Fly product upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "No id provided" }, { status: 400 });
    }

    const products = await readIndex();
    const product = products.find((p) => p.id === id);

    if (product) {
      try {
        await unlink(path.join(PRODUCTS_DIR, product.filename));
      } catch { /* file might already be deleted */ }
    }

    const updated = products.filter((p) => p.id !== id);
    await writeIndex(updated);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fly product delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
