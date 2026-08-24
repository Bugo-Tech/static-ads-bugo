import { NextRequest, NextResponse } from "next/server";
import { resizeForClaudeIfNeeded } from "@/lib/resizeImage";
import { readFile } from "fs/promises";
import path from "path";
import { analyzeAntsReference } from "@/lib/ants-claude";
import type { Language } from "@/lib/types";
import { readProductFile, type ProductScope } from "@/lib/productImages";
import { downloadFile } from "@/lib/supabase-storage";

// A Claude vision call with max_tokens 8192 takes 20-60s. Without this, Vercel
// uses its default function limit (10s on Hobby) and kills the request, handing
// the browser an HTML error page instead of JSON. 60 is the Hobby ceiling and is
// valid on Pro too; raise to 300 on Pro if analyses still get cut off.
export const maxDuration = 60;


const PRODUCT_SCOPE: ProductScope = "ants";

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

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      language = (formData.get("language") as Language) || "he";

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      let buffer: Buffer = Buffer.from(bytes);
      mimeType = detectMimeType(buffer) || file.type || "image/png";

      // Resize if over 4MB (Claude limit is 5MB, leave margin)
      ({ buffer, mimeType } = await resizeForClaudeIfNeeded(buffer, mimeType));

      imageBase64 = buffer.toString("base64");
    } else {
      const body = await request.json();
      const { imageUrl, language: lang = "he", storagePath, storageBucket } = body as {
        imageUrl: string;
        language?: Language;
        storagePath?: string;
        storageBucket?: string;
      };
      language = lang;

      if (storagePath && storageBucket) {
        const bucket = storageBucket as "references" | "gallery" | "products";
        const buffer = await downloadFile(bucket, storagePath);
        imageBase64 = buffer.toString("base64");
        const ext = path.extname(storagePath).toLowerCase();
        mimeType = MIME_MAP[ext] || detectMimeType(buffer) || "image/png";
      } else if (!imageUrl) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      } else if (imageUrl.startsWith("/api/ants/products/file/")) {
        const filename = imageUrl.split("/").pop()!;
        const buffer = await readProductFile(PRODUCT_SCOPE, filename);
        imageBase64 = buffer.toString("base64");
        const ext = path.extname(filename).toLowerCase();
        mimeType = MIME_MAP[ext] || "image/png";
      } else if (imageUrl.startsWith("/api/upload/file/")) {
        const filename = imageUrl.split("/").pop()!;
        const filepath = path.join(process.cwd(), "uploads", "references", filename);
        const buffer = await readFile(filepath);
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

    const result = await analyzeAntsReference(imageBase64!, mimeType!, language);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Ants analyze error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
