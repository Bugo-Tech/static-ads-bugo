import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { readProductFile, type ProductScope } from "@/lib/productImages";
import { analyzeReference } from "@/lib/claude";
import { resizeForClaudeIfNeeded } from "@/lib/resizeImage";
import { Language } from "@/lib/types";
import { downloadFile } from "@/lib/supabase-storage";

const PRODUCT_SCOPE: ProductScope = "main";

function detectMimeType(buffer: Buffer): string | null {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "image/webp";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  return null;
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let imageBase64: string;
    let mimeType: string;
    let language: Language = "he";
    let productId: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      // File uploaded directly
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      language = (formData.get("language") as Language) || "he";
      productId = (formData.get("productId") as string) || undefined;

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      let buffer: Buffer = Buffer.from(bytes);
      // Detect actual MIME type from file magic bytes, don't trust browser
      mimeType = detectMimeType(buffer) || file.type || "image/png";

      // Resize if over 4MB (Claude limit is 5MB, leave margin)
      ({ buffer, mimeType } = await resizeForClaudeIfNeeded(buffer, mimeType));

      imageBase64 = buffer.toString("base64");
    } else {
      // JSON body with imageUrl (local file path)
      const body = await request.json();
      const { imageUrl, language: lang = "he", productId: pid } = body as {
        imageUrl: string;
        language?: Language;
        productId?: string;
      };
      language = lang;
      productId = pid;

      // Handle Supabase Storage path
      if (body.storagePath && body.storageBucket) {
        const fileBuffer = await downloadFile(body.storageBucket as "references" | "gallery" | "products", body.storagePath);
        // Detect MIME type from magic bytes (reuse existing logic)
        const magicBytes = fileBuffer.slice(0, 4);
        if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50) {
          mimeType = "image/png";
        } else if (magicBytes[0] === 0xff && magicBytes[1] === 0xd8) {
          mimeType = "image/jpeg";
        } else if (magicBytes[0] === 0x52 && magicBytes[1] === 0x49) {
          mimeType = "image/webp";
        } else if (magicBytes[0] === 0x47 && magicBytes[1] === 0x49) {
          mimeType = "image/gif";
        } else {
          mimeType = "image/png";
        }
        imageBase64 = fileBuffer.toString("base64");
      } else if (!imageUrl) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      } else if (imageUrl.startsWith("/api/upload/file/") || imageUrl.startsWith("/api/products/file/")) {
        const filename = imageUrl.split("/").pop()!;
        const buffer = imageUrl.includes("/products/")
          ? await readProductFile(PRODUCT_SCOPE, filename)
          : await readFile(path.join(process.cwd(), "uploads", "references", filename));
        imageBase64 = buffer.toString("base64");
        const ext = path.extname(filename).toLowerCase();
        mimeType = MIME_MAP[ext] || "image/png";
      } else if (imageUrl.startsWith("http")) {
        const res = await fetch(imageUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        imageBase64 = buffer.toString("base64");
        mimeType = res.headers.get("content-type") || "image/png";
      } else {
        return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
      }
    }

    const result = await analyzeReference(imageBase64, mimeType, language, productId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analyze error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
